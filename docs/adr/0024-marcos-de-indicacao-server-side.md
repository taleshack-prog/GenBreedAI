# ADR-0024 — Indicação (referral) no servidor: o cadastro vincula; só GASTAR paga (assinatura ou pacotes de créditos)

- **Status:** aceito · **Data:** 2026-09-18 (revisado no mesmo dia — ver "Correção"; **revisão 2 em 2026-09-19** — ver
  "Revisão 2: só recompensa quando o indicado GASTA")

## Revisão 2 (2026-09-19): só recompensa quando o indicado GASTA

**Decisão do produto.** Indicação só recompensa quando o indicado gasta dinheiro. Duas mudanças:

1. **D1 e D7 CANCELADOS** (antes "pendentes", seção 5 abaixo — mantida como histórico). Indicado que
   fica no Free nunca gera crédito: retorno/login/nascimento de quem não paga não rende nada.
2. **Compra de pacotes de créditos passa a contar**, além da assinatura (que segue igual: JUNIOR 15,
   SENIOR 30, PHD 1 mês do plano do indicador). Regra, com **acumulação por indicado e por tamanho de pacote**:

   | Pacotes comprados pelo MESMO indicado | Recompensa ao indicador |
   |---|---|
   | a cada 3 pacotes de **10** créditos | **2** créditos |
   | a cada 3 pacotes de **30** créditos | **5** créditos |
   | a cada 3 pacotes de **60** créditos | **10** créditos |

   Os baldes são **independentes por tamanho** (2 de 10 + 2 de 30 não fecham nada); o resto (1 ou 2 pacotes)
   fica acumulado para o próximo trio; **sem limite de vezes** (6 pacotes de 10 = 2 trios = 4 créditos).
   **Compras de indicados diferentes nunca se somam** (2 do Bob + 2 da Carol não fecham trio).

**Por quê.**
- **Free não gera receita.** Recompensar cadastro/retorno de quem não paga é custo (1 crédito = 1
  nascimento extra = imagem de IA paga) sem contrapartida. Só gasto real justifica crédito.
- **A acumulação por indicado elimina o farmador.** O trio precisa ser do MESMO indicado e de pacotes IGUAIS: quem quiser
  "farmar" tem que comprar 3 pacotes com dinheiro real numa conta (3 × R$ 5,90 = R$ 17,70 para receber 2 créditos —
  cerca de 7% do gasto; nos pacotes maiores, ~5-6%), e espalhar a compra por várias contas não adianta porque os
  pacotes de contas diferentes não se somam. O custo do golpe é sempre maior que a recompensa.

**Como é feito** (`ReferralService.recordPackPurchase`, chamado pelo `BillingService` no webhook do Stripe quando
o pagamento de um pacote é confirmado — e no `confirm` de dev, com o mesmo id de pagamento):
- O comprador e o pacote vêm de `client_reference_id` e `metadata.packId` (nunca do e-mail); se o comprador não tem
  indicador (não há linha em `referral_referred`), é no-op — nada quebra.
- **Estado no banco** (2 tabelas novas — migração **não gerada** nesta rodada): `referral_pack_purchases` (1 linha por
  PAGAMENTO, `payment_id` = PK) e `referral_pack_trios` (`(referred_id, pack_id)` → `trios_paid`). Quantos pacotes de cada
  tamanho um indicado comprou é a CONTAGEM das linhas de compras — derivada, sem contador separado que possa divergir.
- **Idempotência por pagamento:** registrar a mesma compra de novo (webhook reenviado, ou `confirm` + webhook) é
  `INSERT … ON CONFLICT DO NOTHING`. A etapa de pagar trios roda SEMPRE, então uma falha no meio (compra registrada, crédito
  não) se recupera no retry do Stripe, sem pagar em dobro e sem perder o trio.
- **Cada trio é reivindicado atomicamente:** `UPDATE referral_pack_trios SET trios_paid = trios_paid + 1 WHERE (trios_paid + 1) * 3
  <= (compras) RETURNING` — duas execuções simultâneas nunca pagam o mesmo trio. Se o crédito falha, o trio é devolvido
  (`trios_paid - 1`), o erro sobe e o webhook responde 500 (o Stripe reenvia).
- `GET /referral` devolve, por tamanho de pacote, `purchased`, `triosPaid`, `reward`, o progresso do indicado mais adiantado e
  quantos pacotes faltam; a tela do Perfil mostra isso e o texto "só assinatura e compra de créditos recompensam".
  **D1/D7 saíram** da resposta, do tipo da web, dos contadores da tela e dos textos "em breve".

**Consequências da revisão.**
- **Migração necessária e ainda não gerada:** `referral_pack_purchases` (+ índice `(referred_id, pack_id)`) e
  `referral_pack_trios`. Só aditiva. **Aplicar antes do merge** (DEPLOY.md §7): código novo sem as tabelas quebra o `GET
  /referral` de quem tem indicados e faz o webhook de compra de pacote de um INDICADO responder 500 (o comprador já teria sido
  creditado; o Stripe reenvia e só se recupera depois da migração) — por isso a ordem migrar → merge é obrigatória. Comprador
  sem indicador não toca nas tabelas novas.
- **Colunas D1/D7 mantidas no schema** (`referral_links.d1/d7`, `referral_referred.d1_credited/d7_credited`), marcadas
  `@deprecated`, sem escritor nem leitor. NÃO foram removidas do `schema.ts` de propósito: o `db:generate` emitiria `DROP
  COLUMN`, e como a migração roda ANTES do deploy, o código antigo em produção (que seleciona essas colunas) quebraria na janela
  migrar → deploy. O DROP fica para uma migração futura, depois deste deploy.
- **Crédito concorrente na carteira — achado e corrigido (2026-09-19).** O teste de compras simultâneas
  esperava 4 créditos e recebeu 2. A contagem dos trios estava certa (2 trios reivindicados); o que se perdia era o crédito:
  `WalletService.creditImageCredits` fazia `get` + `save` (ler, somar, gravar), então dois créditos ao mesmo tempo na
  MESMA carteira liam o mesmo saldo e o segundo gravava por cima. Vale em produção (webhooks do Stripe chegam em paralelo) e
  afetava também o pacote do próprio comprador. Corrigido com `WalletRepository.addImageCredits`, atômico nos dois adapters
  (in-memory sem `await` entre ler e gravar; Drizzle: `INSERT … ON CONFLICT (owner_id) DO UPDATE SET image_credits = image_credits
  + n RETURNING`), e `creditImageCredits` delega a ele. **Achado de `consumeImageCredit` (mesmo padrão): corrigido em seguida
  — ver ADR-0029**, que também varreu e corrigiu o resto da carteira e a cota mensal de retratos.
- **Trio pendente nunca se perde:** cada compra do indicado paga TODOS os trios devidos dele — do tamanho comprado e dos outros
  tamanhos —, em laço, cada um reivindicado atomicamente. Se o crédito falha (o trio é devolvido) ou uma compra concorrente não
  enxergou o total, a PRÓXIMA compra do mesmo indicado (de qualquer tamanho) paga o que ficou para trás. Compra de outro
  indicado não paga a pendência dele. Limite: um processo que morra entre reivindicar o trio e creditar o indicador deixaria o
  trio marcado como pago sem o crédito (janela mínima; não há transação entre o `wallets` e as tabelas de indicação).
- Compras feitas ANTES do deploy não contam (não há histórico registrado); só valem as posteriores.
- **Reembolso/estorno de pacote não desfaz o trio** (o sistema não trata eventos de reembolso do Stripe hoje). Risco baixo (o
  trio custa 3 compras reais), a monitorar.
- **Alternativas rejeitadas na revisão:** somar pacotes de todos os indicados de um indicador (permitiria dividir a compra e não
  prende o custo a uma conta); recompensar por valor gasto em R$ (o pedido é por trios de pacotes iguais); recompensar a 1ª compra
  (farmável com 1 pacote barato); manter D1/D7 com condição de gasto (redundante com a compra/assinatura, e exigiria agendador).

---

## Registro histórico (2026-09-18, versão anterior desta ADR — a seção "D1 e D7" abaixo foi **cancelada** na revisão 2)

## Contexto

`ReferralService.recordEvent()` não tinha nenhum chamador: os marcos de
indicação nunca creditavam nada, mesmo com o link de compartilhamento
(`/f/[id]?ref=…`, WhatsApp) já em produção. Além disso o código de indicação
nunca chegava ao cadastro: `/f/[id]` só repassava o `?ref=` aos botões, a
landing e `/signup` não o liam, e `register()` só enviava e-mail/senha/nome.
O contador de cliques também estava morto (`recordReferralClick` nunca era
chamada).

Histórico (não repetir): a rota pública `POST /referral/event` foi removida em
14/09 porque deixava o cliente afirmar marcos e permitia créditos infinitos
variando o id do indicado. **Os marcos são server-side, nunca por chamada do
cliente.**

## Correção (mesmo dia): o cadastro NÃO credita nada

A primeira versão desta ADR pagava +1 crédito ao indicador no cadastro do
indicado. **Revertido:** o cadastro não tem verificação de e-mail, então
qualquer pessoa cria contas com o próprio link e colhe créditos (1 crédito = 1
nascimento extra = custo real de imagem). Os freios que existem (auto-indicação
por id/e-mail/alias) não impedem "vários e-mails diferentes". **Indicação só
paga quando o indicado ASSINA** — um evento que custa dinheiro real a quem tenta
fraudar. O vínculo indicador → indicado continua sendo gravado no cadastro
(sem ele não há como pagar na conversão), com as mesmas proteções. O indicado
não ganha nada por se cadastrar (o texto de compartilhamento não promete ganho).

## Decisão

### 1. Captura do `?ref=` (web)
`RefCapture` (layout raiz, cobre TODA página pública) lê `?ref=`, valida o
formato e guarda em localStorage por 30 dias (último toque vence).
`register()` e `loginWithGoogle()` enviam o código guardado e o limpam no
sucesso. O cliente só informa "vim pelo link de X"; quem decide é o servidor.
O clique é contado 1x por código por sessão (contador público, não credita).

### 2. "Cadastrou" — só vincula (`linkReferred`), sem crédito
Chamado por `AuthService` **dentro do registro** de um usuário NOVO (e-mail ou
Google; login de conta existente nunca vincula), nunca por rota pública.
Grava a linha em `referral_referred` e incrementa o contador `installs`
(informativo; `credits_earned` não muda). Proteções:
- auto-indicação rejeitada: mesmo usuário, ou mesma caixa de e-mail
  (`mailboxKey`: minúsculas, sem `+tag`, sem pontos no Gmail);
- um indicado só vincula uma vez: uma linha por `referred_id` (atribuição
  única, mesmo que apareça com outro código), reivindicada por
  `INSERT … ON CONFLICT DO NOTHING RETURNING` (atômico);
- código inválido, vazio, de tipo errado ou erro interno **nunca quebram o
  cadastro** — só não vinculam (erro é logado).

### 3. "Converteu" — o ÚNICO marco que paga (`recordConversion`, webhook do Stripe)
Quando a assinatura do indicado fica **`active` no Stripe** (status cru — `trialing`
vira ACTIVE no nosso enum mas não rende), em `checkout.session.completed` E em
`customer.subscription.updated` (assinatura que nasceu pendente e ativou
depois). O vínculo assinante → indicador vem de `client_reference_id` (nunca
do e-mail) + a linha de `referral_referred` gravada no cadastro. Recompensa ao
INDICADOR conforme o plano assinado pelo indicado:

| Plano do indicado | Recompensa ao indicador |
|---|---|
| JUNIOR | 15 créditos |
| SENIOR | 30 créditos |
| PHD | 1 mês grátis do plano do indicador (FREE → 1 mês de JUNIOR), em `granted_tiers`, `expires_at` = +30 dias, `reason` = `REFERRAL_PHD:<indicado>:<assinatura>` |

**Idempotência:** a conversão é reivindicada **uma vez por indicado**
(`UPDATE … WHERE convert_credited = false RETURNING`), então reenvio do webhook
e reassinatura do mesmo usuário não creditam de novo (mais estrito que "por
assinatura": impede cancelar e reassinar para farmar). Falha ao recompensar
desfaz a reivindicação e o erro sobe — o webhook responde 500 e o Stripe
reenvia.

### 4. Tela de indicação (perfil)
"Cadastrou" é só um contador informativo (sem valor em créditos); o texto diz
que o crédito vem quando o indicado assina, com os valores por plano. (D1/D7
apareciam como "em breve" — removidos na revisão 2, que também acrescenta o
progresso por tamanho de pacote.) A mensagem de compartilhamento não promete
ganho ao indicado.

### 5. D1 e D7 — NÃO implementados → **CANCELADOS na revisão 2 (2026-09-19)**
*(Histórico; não será implementado: indicado que não gasta nunca gera crédito.)* Dependiam de tarefa agendada. Colunas `d1`/`d7` (contadores e flags
`d1_credited`/`d7_credited`) seguem no schema, sem escritor. O que seria
necessário:
1. **Um gatilho de tempo.** Não existe processo agendado na API (nem
   Redis/BullMQ). Opções: (a) cron externo (ex.: serviço de cron do Railway)
   chamando um script/endpoint interno autenticado; (b) BullMQ + Redis; (c)
   avaliação **preguiçosa** em ações do próprio indicado (ex.: ao coletar o
   bônus diário, comparar `first_seen` com hoje) — sem infra nova, mas só
   credita quando o indicado volta.
2. **Definição de "retornou"** em D1/D7 (login? bônus diário? um cruzamento? um
   nascimento?) — hoje não há registro de último acesso; `wallets.last_daily` e
   `referral_referred.first_seen` já existem.
3. **Valores** (a versão antiga tinha D1 +1, D7 +2 — reconfirmar) e a mesma
   trava atômica por indicado.
4. **Anti-fraude:** pelo mesmo motivo da Correção, só pagar por engajamento
   caro de falsificar (ex.: ≥1 nascimento), nunca por mero retorno/login.

## Consequências

- Indicar só rende quando alguém paga: 15/30 créditos ou 1 mês de plano na
  assinatura. Cadastros em massa com o próprio link não rendem nada.
- **Sem migração de schema (versão original; a revisão 2 exige migração — ver o topo).** As tabelas e colunas existentes bastam (a coluna
  `install_credited`, nome herdado, passa a significar "vínculo gravado").
  Endurecimento opcional (não feito): índice único em
  `referral_referred(referred_id)` para garantir a atribuição única no banco
  (hoje garantida pelo código; a PK é `(code, referred_id)`).
- **Mês grátis de quem já assina:** `TierService` prioriza assinatura ativa, então
  para um indicador que JÁ paga aquele plano a concessão só passa a valer se a
  assinatura cair antes de expirar (não há como dar "mês grátis" na assinatura
  Stripe sem crédito/cupom — fora do escopo). Concessões não se somam: cada
  uma expira 30 dias após ser dada.
- `BillingService` e `AuthService` dependem de `ReferralService`
  (`ReferralModule` importado por ambos, sem ciclo). `SubscriptionsRepository`
  ganhou `findById` (necessário porque `customer.subscription.updated` só traz o
  id da assinatura).
- **Fraude que sobra:** o vínculo em massa é inofensivo (não paga), mas uma
  pessoa ainda pode assinar um plano barato via conta secundária para "pagar" o
  próprio indicador; o custo é o preço do plano (JUNIOR) contra 15 créditos.
  Vale monitorar conversões por indicador.

## Alternativas consideradas
- **+1 crédito no cadastro** — implementada e revertida no mesmo dia (farmável
  sem verificação de e-mail).
- **Exigir verificação de e-mail para pagar o cadastro** — rejeitada por ora:
  não existe fluxo de verificação e mesmo assim o custo de criar caixas de
  e-mail é baixo; a assinatura é o sinal confiável.
- **Rota pública para o cliente informar marcos** — rejeitada (é exatamente o
  bug de 14/09).
- **Idempotência por assinatura** — rejeitada por ser fraudável (cancelar e
  reassinar).
- **Cron para D1/D7 agora** — rejeitada: exigiria infraestrutura nova
  (agendador/worker) fora do escopo desta correção.
