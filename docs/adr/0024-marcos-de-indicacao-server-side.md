# ADR-0024 — Indicação (referral) no servidor: o cadastro vincula, só a assinatura paga

- **Status:** aceito · **Data:** 2026-09-18 (revisado no mesmo dia — ver "Correção")

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
que o crédito vem quando o indicado assina, com os valores por plano. D1/D7
aparecem como "em breve" (não como 0 permanente). A mensagem de compartilhamento
não promete ganho ao indicado.

### 5. D1 e D7 — NÃO implementados
Dependem de tarefa agendada. Colunas `d1`/`d7` (contadores e flags
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
- **Sem migração de schema.** As tabelas e colunas existentes bastam (a coluna
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
