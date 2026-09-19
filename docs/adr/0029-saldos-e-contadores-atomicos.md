# ADR-0029 — Saldos e contadores: todo ajuste é UM `UPDATE` atômico, nunca leitura seguida de escrita

- **Status:** aceito · **Data:** 2026-09-19

## Contexto

O teste de compras simultâneas da indicação (ADR-0024, rev. 2) esperava 4 créditos e recebeu 2: dois créditos ao
mesmo tempo na MESMA carteira liam o mesmo saldo e o segundo gravava por cima (`creditImageCredits` fazia `get` +
`save`). Ao varrer o resto, o mesmo padrão apareceu em vários lugares — alguns com prejuízo direto:

| Onde | Padrão | Efeito sob concorrência |
|---|---|---|
| `WalletService.consumeImageCredit` | ler saldo → conferir `> 0` → gravar `- 1` | **o mesmo crédito gasto duas vezes** — cada gasto vira uma imagem paga na fal.ai |
| `WalletService.charge` (congelar/descongelar) | ler → conferir → gravar | gasto acima do saldo |
| `WalletService.credit` (recompensa de fixação, a cada nascimento de aura 4-5) | ler → somar → gravar | crédito perdido |
| `WalletService.claimDaily` | ler `last_daily` → conferir → gravar | bônus diário coletado duas vezes |
| `WalletService.claimBiweekly` | ler `last_biweekly` → conferir → gravar | bônus quinzenal (+1 crédito) concedido duas vezes |
| `ImageQuotaService.tryConsume` | ler o uso → comparar com o limite → incrementar | **passa do limite mensal de retratos** (imagem paga a mais) |
| `WalletService.creditImageCredits` | ler → somar → gravar | crédito perdido (corrigido antes, ADR-0024) |

**Pior, e independente de concorrência:** `charge`, `credit` e `claimDaily` montavam a carteira nova só com
`catalisadores`/`biomassa` (e `lastDaily`) e chamavam `save`, que no Drizzle grava **todas** as colunas
(`image_credits = w.imageCredits ?? 0`, `last_daily`/`last_biweekly = ?? null`). Pela leitura do código, cada
nascimento de aura 4-5, cada coleta diária e cada congelar/descongelar **zerava os créditos comprados** do jogador
e reiniciava as janelas do bônus. *(Achado por leitura, não reproduzido; conferir a produção.)*

Já estavam corretos (mantidos): `QuotaService` (transação com `pg_advisory_xact_lock` no banco; sem `await` entre
contar e reservar em memória), contadores de indicação (`+ 1` em SQL), `payment_intents.claimCredit`, os claims
de gestação/primeira gestação/aviso de gestação concluída, o claim de trios, o upsert de assinaturas de push.

## Decisão — o padrão a seguir

> **Todo ajuste de saldo ou contador é UM comando atômico: `UPDATE ... SET x = x ± n [WHERE <condição>] RETURNING`
> (ou `INSERT ... ON CONFLICT DO UPDATE`). Nunca leitura seguida de escrita.**

1. **A condição vai dentro do `WHERE`.** "Tem saldo?" (`image_credits > 0`, `catalisadores >= custo`), "já coletou
   hoje?" (`last_daily <> hoje`), "cabe na cota?" (`used < limite`, em `ON CONFLICT ... WHERE`) são decididos pelo
   banco, na mesma instrução que altera. `RETURNING` (0 linhas = recusado) devolve o resultado. Dois pedidos
   simultâneos: o Postgres serializa a linha, o segundo reavalia a condição depois do lock e é recusado.
2. **Cada operação só toca as colunas que muda.** Proibido regravar a carteira/linha inteira a partir de um
   objeto lido (`save`): apaga o que o pedido não conhecia. `WalletRepository.save` fica só para montar estados em
   testes; nenhum código de produção o chama.
3. **Linha inexistente.** Somas usam `INSERT ... ON CONFLICT DO UPDATE` (a carteira nasce com os valores iniciais
   já somados); gastos/coletas garantem a linha antes (`INSERT ... ON CONFLICT DO NOTHING`) e fazem o `UPDATE`
   condicional; `takeImageCredit` sem linha = sem saldo.
4. **Adapter em memória = mesmo contrato**, com o método inteiro SEM `await` entre ler e gravar (o JS é
   single-thread, então é indivisível). Todo método novo de saldo vai nos DOIS adapters (CLAUDE.md §7).
5. **Reivindicar antes de dar; desfazer se falhar.** Para "1 vez só" (bônus, trio, aviso), reivindicar
   atomicamente primeiro e só então creditar; se creditar falhar, devolver a reivindicação e propagar o erro.

Aplicado nesta rodada (`WalletRepository`): `addImageCredits`, `takeImageCredit`, `addResources`, `spendResources`,
`claimDaily`, `claimBiweekly`; `ImageQuotaService.tryConsume` com o limite em `ON CONFLICT ... WHERE used < limite`.
`WalletService` só delega.

## Regra de tempo (adendo, 2026-09-19): regra de negócio dependente de tempo usa `Clock`, nunca a data do sistema

> **Toda decisão de regra de negócio que depende de "agora" (dia do bônus, janela de dias, mês da cota, expiração,
> prazo) lê o instante de `Clock` (`apps/api/src/common/clock.ts`), injetado — NUNCA `new Date()` / `Date.now()`
> direto num serviço.** Sem isso a passagem do tempo não é testável (o teste teria que esperar de verdade) e a regra
> nova nasce sem cobertura. Os testes fixam o relógio com `SystemClock.setForTesting(...)` (nunca `vi.useFakeTimers()`,
> que trava o `app.inject()` do Fastify).

Aplicado: `WalletService` (bônus diário e quinzenal) e `ImageQuotaService` (mês da cota) passaram a receber
`clock: Clock = new SystemClock()` — o valor padrão mantém o comportamento de produção idêntico e as 39 chamadas
`new WalletService(repo)` de testes/scripts válidas; em produção o Nest injeta o `Clock` compartilhado
(`EconomyModule` e `ImageModule` importam `ClockModule`; esquecer o import derruba o boot, não passa em silêncio).
Cobertura nova (`wallet-clock.spec.ts`): diário (recusa no mesmo dia, aceita após a meia-noite, coletas simultâneas
→ uma só), quinzenal (recusa agora e aos 14 dias, aceita aos 15, a janela recomeça a cada coleta, FREE → 403), cota
mensal (zera na virada do mês), e virada de mês/ano/bissexto nas três regras.

**Usos de `new Date()`/`Date.now()` que decidem regra e AINDA não usam `Clock` (fora desta rodada):**
`granted_tiers` — se o tier concedido ainda vale (`granted-tiers.repository.ts`) — e `subscriptions` — se uma
assinatura `PAST_DUE` ainda conta como ativa (`subscriptions.repository.ts`). Corrigir muda a assinatura das portas
de repositório de tier (o `TierService` passaria o instante); recomendável numa rodada própria, pois hoje a expiração
de 30 dias do prêmio de indicação não é testável. Os demais usos são timestamps de auditoria, ids, versão de cache de
imagem e valor padrão do fim do período Stripe — não decidem regra.

### Ponto de decisão de produto — o "dia" e o "mês" são em UTC (não corrigido)

- **Bônus diário:** o dia é `AAAA-MM-DD` do instante em **UTC**; recusa se `last_daily` for igual a hoje. Em São
  Paulo (UTC−3) o "dia" vira às **21:00**, não à meia-noite: quem coleta às 20:30 pode coletar de novo às 21:30 do
  mesmo dia civil local.
- **Cota mensal de retratos extras:** o mês é `AAAA-MM` em UTC — reinicia às **21:00** de São Paulo do último dia.
- **Bônus quinzenal:** janela móvel de 15 × 24 h entre dois INSTANTES (aceita a partir de exatamente 15 dias); não
  depende de fuso.
- **Inconsistência:** a vaga de nascimento diária de SENIOR/PHD usa o dia civil de **America/Sao_Paulo**
  (`startOfSaoPauloDay`). Se o produto quiser um único "dia" para o jogador, é decisão de regra (e de migração: quem
  coletou perto da virada); os testes marcados "COMPORTAMENTO ATUAL" em `wallet-clock.spec.ts` documentam o que
  existe e mudam junto com a regra.

## Consequências

- **Correção de comportamento:** créditos comprados e as janelas do bônus deixam de ser apagados por
  `charge`/`credit`/`claimDaily`; `claimDaily` devolve agora a carteira completa (antes só os campos que montava).
- Mensagens de erro de saldo iguais às de antes ("Catalisadores insuficientes.", "Biomassa insuficiente."), e
  "Saldo insuficiente." só no caso raro de outro pedido gastar no meio. Nenhuma mudança de schema/migração.
- **Comparação de janela do bônus quinzenal:** `last_biweekly` é texto ISO 8601 UTC (`toISOString()`), então
  `last_biweekly <= cutoff` em texto equivale a comparar instantes (mesmo formato, mesmo tamanho).
- *(Atualização 2026-09-19 — resolvido: ver "Regra de tempo" abaixo.)* `WalletService` usava `new Date()` para o
  dia/janela do bônus; agora usa `Clock`.
- Os adapters Drizzle não têm teste em PGlite (não há teste de carteira em banco de mentira e as migrações
  refletem só o schema antigo para as tabelas de indicação); a exclusividade é coberta no adapter em memória.
- Lacuna conhecida (não é saldo): entre reivindicar o trio/bônus e creditar não há transação com outra tabela;
  um processo que morra nessa janela mínima deixa o item marcado como pago sem o crédito.

## Alternativas consideradas

- **Transação com `SELECT ... FOR UPDATE` (ler e gravar dentro dela)** — funciona, mas mais lenta, mais código e
  fácil de esquecer o lock; o `UPDATE` condicional entrega a mesma garantia em uma instrução.
- **Lock em memória por carteira** — só vale dentro de UM processo; a API pode rodar em mais de uma instância.
- **Versão otimista (coluna `version` + retry)** — exige retry em todo chamador e coluna nova; sem ganho aqui.
- **Corrigir só `consumeImageCredit`** — deixaria o `charge`/`credit`/`claimDaily` apagando créditos e os bônus
  duplicáveis; a varredura mostrou que era o mesmo defeito em seis lugares.
