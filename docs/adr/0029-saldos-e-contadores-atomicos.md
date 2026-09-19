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
(Depois da decisão de fuso único, o dia e o mês são os de São Paulo — ver "Decisão de produto (2026-09-19)" abaixo —, e os
testes de `wallet-clock.spec.ts` e `sao-paulo-time.spec.ts` foram escritos nessa regra.)
Cobertura nova (`wallet-clock.spec.ts`): diário (recusa no mesmo dia, aceita após a meia-noite, coletas simultâneas
→ uma só), quinzenal (recusa agora e aos 14 dias, aceita aos 15, a janela recomeça a cada coleta, FREE → 403), cota
mensal (zera na virada do mês), e virada de mês/ano/bissexto nas três regras.

**Tier efetivo (`granted_tiers` e `subscriptions`) — resolvido (2026-09-19).** Os dois últimos pontos do servidor que
decidiam regra pela data do sistema — se o tier concedido ainda vale (o mês grátis de 30 dias do prêmio de indicação PHD)
e se uma assinatura `PAST_DUE` ainda conta como ativa — agora recebem o instante do `Clock`. **A regra NÃO mudou:**
- `granted_tiers`: vale enquanto `expiresAt > agora` (**estrito**: no instante exato do vencimento já não vale).
- `subscriptions`: `ACTIVE` sempre vale; `PAST_DUE` vale enquanto `currentPeriodEnd > agora` (**estrito**); `CANCELED` e
  `INCOMPLETE` nunca valem. Prioridade do `TierService`: assinatura válida vence a concessão (mesmo de tier maior);
  concessão vencida não promove.

**Como o instante chega ao repositório (sem poluir a interface):** o `TierService` — que já é quem decide — lê o `Clock`
**uma vez por decisão** e o passa como PARÂMETRO: `findActiveForUser(userId, now)` nas duas portas. Os repositórios (in-memory
e Drizzle) continuam sem relógio, só dado. Alternativa descartada: injetar `Clock` em cada adapter — exigiria dependência
nas fábricas dos módulos e nos construtores usados em vários testes, e deixaria a regra de tempo espalhada em quatro
classes em vez de uma. `TierService` recebe `clock: Clock = new SystemClock()` (produção idêntica; as chamadas
`new TierService(subs, grants)` continuam válidas) e o `TierModule` importa `ClockModule`. Cobertura em
`tier-clock.spec.ts`: concessão de 30 dias (dia 29, último instante do dia 30, vencimento), PAST_DUE até `currentPeriodEnd`,
CANCELED/INCOMPLETE, prioridade, viradas de mês/ano/bissexto e a via real do prêmio de indicação.

**Varredura final no servidor:** nenhum outro uso de `new Date()`/`Date.now()` decide regra. Os que sobram são timestamps
de auditoria (`updated_at`, `credited_at`, `createdAt` em memória), ids (usuário, pagamento simulado, reserva), versão de
cache de imagem, o horário do log de `push:dispatch` e o valor padrão do fim do período Stripe quando ele não vem no evento
(`billing.service.ts`). **Na web** há duas cópias da regra "PAST_DUE ainda vale" com `Date.now()`
(`effectiveTierFromSubscription` em `lib/api.ts` e a checagem de assinatura ativa em `app/app/planos/page.tsx`) — só
exibição; o servidor (`TierService`) é a fonte de verdade e a web não usa isso para liberar nada. Ficam como estão
(recomendável dar um parâmetro `now` a essas funções se um dia precisarem de teste).

### Decisão de produto (2026-09-19): FUSO ÚNICO — o "dia" do jogo é o dia civil de São Paulo

Antes: o bônus diário e a cota mensal de retratos usavam **UTC** (o dia/mês virava às **21:00** de Brasília: quem
coletava às 20:30 podia coletar de novo às 21:30, dois bônus numa mesma noite) enquanto a vaga de nascimento diária de
SENIOR/PHD já usava o dia civil de `America/Sao_Paulo` — um "dia" diferente por regra, o que confundia o jogador.

**Agora o jogo tem um único "dia": o dia civil de São Paulo.**
- **Bônus diário:** o dia é `saoPauloDate(clock.now())` (`AAAA-MM-DD`); vira à **meia-noite de Brasília**. Recusa se
  `wallets.last_daily` for igual a hoje. Às 20h e às 22h do mesmo dia → a 2ª é recusada; às 23h59 e às 00h01 → a 2ª é aceita.
- **Cota mensal de retratos extras:** o mês é `saoPauloMonth(clock.now())` (`AAAA-MM`); reinicia à **meia-noite do dia 1
  de Brasília**, não às 21h do último dia.
- **Bônus quinzenal: NÃO mudou** — é um intervalo entre INSTANTES (15 × 24 h, aceita a partir de exatamente 15 dias) e não
  depende de fuso.
- **Implementação única e reaproveitada:** `apps/api/src/common/sao-paulo-time.ts` (`civilDateIn`, `civilMonthIn`,
  `startOfCivilDayIn`, `saoPauloDate`, `saoPauloMonth`, `startOfSaoPauloDay`, `startOfNextSaoPauloDay`). A função que a vaga
  de nascimento já usava (`startOfSaoPauloDay`) foi movida para lá e reexportada por `quota.service.ts` — não há uma segunda
  implementação. Qualquer regra nova que precise de "dia" ou "mês" do jogador usa este módulo.
- **Horário de verão:** o cálculo antigo somava um `-03:00` FIXO; agora usa o banco de fusos do runtime (`Intl`), então acerta
  o horário de verão se ele voltar (o Brasil não adota desde 2019; adotou em 2018-19) e os dias de 23/25 horas — inclusive o
  dia em que a meia-noite não existe (00:00 → 01:00). O "início do dia seguinte" deixou de ser "início + 24 h".

#### Transição — efeito sobre quem já coletou (a virada muda o significado de dados existentes)

`wallets.last_daily` guarda o dia da última coleta como texto `AAAA-MM-DD`, gravado pela regra antiga (data em UTC).
Um instante entre 21:00 e 23:59 de Brasília tem data UTC = "amanhã" em relação a São Paulo.
- **Quem coletou entre 21h e 23h59 (Brasília) na última noite da regra antiga** fica com `last_daily` = D+1 (UTC). Na
  regra nova, em D+1 isso é "hoje" → **recusa o dia todo e ele perde o bônus de D+1** (só volta em D+2).
  Só existem esses registros se o deploy acontece na MESMA noite (registros "no futuro" em relação a São Paulo).
- **Deploy em outro horário:** o efeito é só de quem coletou na noite anterior (21h–23h59): a data UTC gravada é a de hoje
  em São Paulo, então recusa até a meia-noite — na regra antiga ele coletaria de novo às 21h. Perde no máximo "as horas até a
  meia-noite"; nenhum bônus a mais é concedido. **Deixar como está.**
- **Quantos registros existem hoje: não sei** — só edito arquivos e não consulto o banco. Para contar antes de decidir:
  ```sql
  -- registros "no futuro" em relação ao dia de São Paulo (a única categoria que perde um bônus inteiro)
  SELECT last_daily, count(*) FROM wallets
  WHERE last_daily > to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
  GROUP BY last_daily ORDER BY last_daily;
  ```
- **Correção recomendada** (SQL; **não é migração de schema, não foi criada nem rodada**): fazer o deploy do código novo e
  rodar isto **na mesma noite, entre 21:00 e 23:59 de Brasília, DEPOIS do deploy** (o código novo já grava o dia de São Paulo):
  ```sql
  -- quem coletou hoje à noite (data UTC = amanhã) volta a ter "hoje" (data de São Paulo): pode coletar amanhã
  UPDATE wallets
  SET last_daily = to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
  WHERE last_daily = to_char(((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1), 'YYYY-MM-DD');
  ```
  Rodada depois da meia-noite de Brasília a condição não casa com nada (inofensiva). Nenhum jogador perde bônus nem ganha
  bônus a mais. Sem esse ajuste, a alternativa é "deixar como está" (perda de 1 bônus só para os que coletaram na noite do deploy).
- **Cota mensal (`image_quota.ym`, texto `AAAA-MM` em UTC):** o consumo das 21h–23h59 de Brasília do ÚLTIMO dia de um mês foi
  gravado no mês seguinte (UTC). Na regra nova essa hora pertence ao mês que termina. Efeito: se o deploy for no meio do mês,
  a linha do mês atual pode conter consumo dessa última noite do mês anterior (o jogador tem alguns retratos extras a menos
  naquele mês, uma vez). **Não há como separar** (a tabela não guarda o instante de cada consumo), então **não há SQL de ajuste
  confiável — deixar como está.** Para dimensionar: `SELECT ym, count(*) AS donos, sum(used) AS usados FROM image_quota GROUP BY
  ym ORDER BY ym DESC LIMIT 3;`. Evitar fazer o deploy na última noite (21h–23h59) de um mês, quando a linha do mês seguinte já
  existe com consumo do mês que acaba.
- **Bônus quinzenal:** nenhum registro é afetado (`last_biweekly` é um instante ISO).

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
