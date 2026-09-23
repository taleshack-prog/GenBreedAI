# Deploy do GenBreedAI (genbreed.com.br)

Guia de infraestrutura e operação. Estado conferido contra o código em 2026-09-18. Itens marcados **(informado)** vêm do
responsável do produto e não são verificáveis pelo repositório.

> ## ⚠️ `db:reset` APAGA os espécimes de todos os jogadores
> `pnpm --filter @genbreedai/api db:reset` apaga **TODOS os espécimes e cruzamentos** do banco e re-semeia só os
> fundadores. **Só serve para um ambiente LOCAL vazio.** Nunca use em produção nem em qualquer banco com dados de jogadores.
> A trava (`ALLOW_DB_RESET=yes-destroy-all-data`, e `ALLOW_DB_RESET_REMOTE=yes` para host Neon) existe, mas não é motivo para
> usar o comando: **para semear fundadores use `db:seed`** (aditivo, não apaga nada).

Arquitetura em produção:
- **Web** (Next.js) → **Vercel**
- **API** (NestJS + Fastify) → **Railway** (Docker: `apps/api/Dockerfile` + `railway.json`)
- **Banco** (PostgreSQL) → **Neon**
- **Imagens** (PNG da IA, FLUX.2 pro) → **Cloudflare R2** (bucket + URL pública)
- **Pagamentos** → **Stripe (live, informado)** — checkout de pacotes, assinaturas e webhook
- **Domínio** → genbreed.com.br (Vercel para o site; subdomínio opcional para imagens)

O web fala com a API por um **proxy same-origin** (`/api/*` → API), então não há CORS.

**Deploy automático:** cada merge na `main` faz deploy no Vercel e no Railway **(informado — não há workflow de CI no repo)**.
**A migração de banco NUNCA roda sozinha no deploy** (o container só inicia; `main.ts` não migra). Ver seção 7.

---

## 1) Neon (banco)
Guarde a `DATABASE_URL` do projeto. Toda mudança de schema é aplicada **à mão, antes do deploy que a exige**, com backup
(seção 7). Banco novo e vazio: seção 8.

## 2) Cloudflare R2 (imagens)
1. Painel Cloudflare → **R2** → **Create bucket** → nome `genbreed-images`.
2. No bucket → **Settings** → **Public access**: habilite **R2.dev subdomain** (ou conecte um domínio custom, ex.:
   `img.genbreed.com.br`). Copie a **Public URL**.
3. **R2** → **Manage R2 API Tokens** → **Create API token** (*Object Read & Write* no bucket). Anote **Access Key ID**,
   **Secret Access Key** e o **Account ID**.
4. Você terá as cinco variáveis: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`.
   **Todas as cinco são necessárias** — ver a seção 3 para o que acontece se faltar uma.

## 3) Variáveis de ambiente

### 3.1 API (Railway) — obrigatórias em produção e o efeito de cada uma faltar

| Variável | Para quê | Se faltar |
|---|---|---|
| `DATABASE_URL` | Postgres (Neon). **Regra em produção:** definida, sem espaço/quebra de linha e começando em `postgres://` ou `postgresql://` | **A API NÃO sobe** (`NODE_ENV=production`): o boot falha com `[db] DATABASE_URL inválida em produção: <motivo>` (a mensagem nunca imprime o valor — tem senha) e o processo sai com código 1. Antes, sem ela todos os módulos caíam em repositórios em MEMÓRIA e a perda de dados era silenciosa. Fora de produção o modo em memória continua, com aviso `[db] DATABASE_URL não definida … os dados NÃO persistem` 1x por processo. |
| `AUTH_SECRET` | Assina/valida o JWT (gere: `openssl rand -hex 32`). **Regra em produção:** definida, sem espaço/quebra de linha nas pontas, **≥ 32 caracteres**, ≥ 8 caracteres distintos e sem valor óbvio/placeholder (o padrão antigo `dev-insecure-secret-change-me`, "change-me", "insecure", "example", "default"…) | **A API NÃO sobe** (`NODE_ENV=production`): o boot falha com `[auth] AUTH_SECRET inválida em produção: <motivo>` e o processo sai com código 1 (veja `[boot] A API NÃO subiu` nos logs do Railway; o que acontece com a versão anterior depende de haver healthcheck configurado — **a confirmar**). Nunca cai no padrão. Fora de produção o padrão existe, com aviso no log. |
| `FAL_KEY` | fal.ai (geração de retrato) | Modo procedural: nascimentos ficam **sem retrato de IA**; nada é cobrado nem gerado (aviso `[storage] modo PROCEDURAL` no boot, 1x por processo, se também não houver `R2_*`). **Definida em produção, exige as cinco `R2_*`** (linha abaixo). |
| `FAL_MODEL` | Modelo de imagem. Opcional; padrão `fal-ai/flux-2-pro`, o **mesmo para todo tier** | Usa o padrão. **Não defina `FAL_MODEL_PHD`** — é ignorada (aviso no log). |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Storage de imagens no R2 | **Regras em produção (ADR-0031)** — "definida" = não vazia após `trim()`: **(1)** com `FAL_KEY` definida, as **cinco** são obrigatórias; **(2)** configuração **PARCIAL** (1 a 4) barra o boot **mesmo sem `FAL_KEY`** (erro de digitação, não escolha); **(3)** sem `FAL_KEY` e sem nenhuma `R2_*`: passa (modo procedural, nada a guardar), com aviso. Violando (1) ou (2), **a API NÃO sobe** (`NODE_ENV=production`): o boot falha com `[storage] R2 inválido em produção: <motivo>` (só NOMES de variável, nunca valores) e o processo sai com código 1 (`[boot] A API NÃO subiu` nos logs do Railway). Antes, faltando qualquer uma o storage caía no **disco do container** e as imagens sumiam no próximo deploy, em silêncio. Fora de produção nada falha: se as imagens cairiam no disco local, avisa `[storage] R2 incompleto … NÃO persistem` 1x por processo. **Vale só para a API HTTP:** scripts (`push:dispatch` no serviço `push-cron`, que tem só `DATABASE_URL` e `VAPID_*`; `db:*`; `images:*`) não passam por essa checagem — cada um exige apenas o que usa (teste `cli-boot-isolation.spec.ts`). **Limite da checagem:** confere só **presença** — não sabe se `R2_PUBLIC_URL`/`R2_BUCKET` estão *certos* nem se o token tem permissão; o teste do checklist (gere um retrato e veja a URL) continua valendo. |
| `STRIPE_SECRET_KEY` | Chave **live** (`sk_live_…`) do Stripe | **Chave definida = billing REAL ligado; o boot exige o resto (ADR-0031, adendo 2, abaixo).** Sem ela o billing cai no **provider stub de dev** (não cobra de verdade; em produção o `/billing/confirm` do stub fica bloqueado, seção 3.3): compras e assinaturas **não funcionam**. A API **sobe** (billing desligado é escolha válida), com aviso `[billing] STRIPE_SECRET_KEY não definida — billing DESLIGADO` 1x por processo — e, se `STRIPE_WEBHOOK_SECRET`/`STRIPE_*_URL` estiverem definidos, o aviso diz que serão IGNORADOS (a chave provavelmente sumiu). |
| `STRIPE_WEBHOOK_SECRET` | Verifica a assinatura de `POST /api/v1/billing/webhook`. **Obrigatória em produção quando há `STRIPE_SECRET_KEY`** (em branco = ausente) | **A API NÃO sobe** (`NODE_ENV=production` + `STRIPE_SECRET_KEY`): o boot falha com `[billing] Stripe inválido em produção: STRIPE_WEBHOOK_SECRET não está definida …` (só NOMES de variável, nunca valores) e o processo sai com código 1. Antes o webhook respondia 400 e o jogador pagava no Stripe **sem receber** pacote, plano nem recompensa de indicação, sem aviso. Fora de produção: só avisa `[billing] … NÃO serão creditados` 1x por processo. |
| `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` | Retorno do Checkout. **Obrigatórias em produção quando há `STRIPE_SECRET_KEY`, e precisam ser `https://` e não apontar para localhost** (`localhost`, `*.localhost`, `127.x`, `0.0.0.0`, `::1`), sem espaço/quebra de linha (ex.: `https://genbreed.com.br/app/profile?billing=success&session_id={CHECKOUT_SESSION_ID}` e `https://genbreed.com.br/app/profile?billing=cancel`) | **A API NÃO sobe** (mesmo erro `[billing] Stripe inválido em produção: STRIPE_SUCCESS_URL … não usa https / aponta para localhost / não está definida`). Antes o Checkout usava o padrão de dev e o cliente pagava e voltava para `http://localhost:3000`. Fora de produção o padrão `localhost:3000` continua valendo, sem aviso. A checagem não confere o domínio (só barra o que com certeza é erro). |
| `GOOGLE_CLIENT_ID` | Login Google (opcional) | O login Google responde 400 ("não configurado"); e-mail/senha segue funcionando. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push ("Gestação concluída", ADR-0028). Gere o par uma vez (ver "Notificações (Web Push)" na seção 8); a privada NUNCA sai do servidor. `VAPID_SUBJECT` é opcional (`mailto:` ou URL do responsável; padrão `https://genbreed.com.br`) | **Recurso DESLIGADO, nada quebra:** `GET /push/config` → `enabled:false`, `POST /push/subscribe` → 503, a web esconde o botão "Avisar quando nascer" e o `push:dispatch` imprime "DESLIGADO" e sai com 0 sem marcar nenhuma entrada. Só UMA das duas definida = configuração incompleta: **em produção a API NÃO sobe** (ADR-0031, adendo 2: `[push] VAPID inválido em produção: VAPID_PUBLIC_KEY definida, FALTA VAPID_PRIVATE_KEY`, sem valores; saída 1) — antes desligava o recurso em silêncio; fora de produção só avisa 1x por processo. O `push:dispatch` (cron) tem a própria checagem e aborta com erro; **ele NÃO passa pelo boot da API** e não exige variável do Stripe/R2/`AUTH_SECRET`. |
| `NODE_ENV=production` | Já definido no `Dockerfile` — **não sobrescreva** | É o que faz o código ignorar as flags de dev (seção 3.3) **e** exigir `AUTH_SECRET`, `DATABASE_URL`, o R2, o Stripe (com `STRIPE_SECRET_KEY`) e o VAPID sem metade (regras acima) válidos no boot. Sem ele a API roda em modo "dev" (segredo padrão inseguro, dados em memória e imagens em disco local incluídos). |
| `PORT` | O Railway injeta | — |

### 3.2 Web (Vercel)
- `API_URL` — **opcional**: em produção o `next.config.mjs` já aponta por padrão para a API pública do Railway. Defina só se a
  URL da API mudar (sem `/api` no fim).
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — opcional; sem ela o botão de login Google não aparece.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — opcional; a MESMA chave pública de `VAPID_PUBLIC_KEY` da API. Sem ela o botão "Avisar quando
  nascer" não aparece. É inlinada no build: mudar exige novo deploy da web. Se for diferente da da API, as assinaturas são aceitas
  mas o envio falha (o serviço de push recusa a assinatura VAPID).

### 3.3 Variáveis que NÃO podem existir em produção

As quatro flags de dev abaixo (mais o alias depreciado) passam por **uma função só** — `isDevFlagEnabled`
(`apps/api/src/common/dev-flags.ts`): com `NODE_ENV=production` (já definido no `Dockerfile`) a variável é **IGNORADA mesmo definida
como `true`**, com um aviso no log 1x por processo (`[dev-flag] … foi IGNORADA`). Isso é rede de segurança contra erro — **elas
continuam não devendo existir em produção**; se o aviso aparecer nos logs do Railway, remova a variável.

| Variável | O que liberaria indevidamente | O código ignora em produção? |
|---|---|---|
| `QUOTA_UNLIMITED_DEV` | Desliga **toda** cota: o limite técnico de 60 cruzamentos/hora **e** as vagas de nascimento — nascimentos ilimitados, ou seja, custo de imagem sem teto | **Sim** |
| `CROSS_QUOTA_UNLIMITED` | Nome antigo, **mesmo efeito** que a anterior (depreciada) | **Sim** |
| `IMAGE_QUOTA_UNLIMITED` | Cota mensal de retratos extras **ilimitada**: regenerar retrato sem limite e sem gastar crédito, com gasto de fal.ai sem teto | **Sim** (a partir de 2026-09-18) |
| `AUTH_DEV_HEADERS` | Aceita `x-user-id` sem senha nem JWT (qualquer um age como qualquer usuário, inclusive o dono dos fundadores) e `x-user-tier` (declara um tier pago sem assinatura — qualquer pessoa vira PhD de graça) | **Sim** (a partir de 2026-09-18) |
| `BILLING_STUB_ENABLED` | Habilita `POST /api/v1/billing/confirm` (confirmação manual). Sem `STRIPE_SECRET_KEY` (provider stub) isso **aprova qualquer pagamento** e credita de graça; com Stripe, deixa o chamador creditar a **própria** carteira com o `intentId` de qualquer sessão paga | **Sim** (a partir de 2026-09-18) |
| `ALLOW_DB_RESET`, `ALLOW_DB_RESET_REMOTE` | Destravam o `db:reset` (apaga espécimes). Só se definem na linha de comando de um reset **local** | **Não** (são a própria trava — nunca ficam no ambiente permanente) |

Efeito de o código ignorar em produção: `AUTH_DEV_HEADERS` → o cabeçalho de dev responde 401 e `x-user-tier` não promove ninguém;
`IMAGE_QUOTA_UNLIMITED` → a cota mensal de retratos extras continua contando; `BILLING_STUB_ENABLED` → `/billing/confirm` responde 403
(o crédito real vem só do webhook do Stripe; a web não chama `/confirm` quando há `checkoutUrl`). Fora de produção (dev/teste) as
flags valem como sempre — o `.env.example` local as usa.

Na dúvida: **remova a variável** (não a defina como `false`).

## 4) API no Railway (primeira vez)
1. railway.com → **New Project** → **Deploy from GitHub repo** → `GenBreedAI`.
2. Em **Settings** do serviço: **Root Directory** `/` (raiz), **Build** Dockerfile em `apps/api/Dockerfile` (o `railway.json` já aponta isso).
3. **Variables**: as da seção 3.1. Nenhuma da 3.3.
4. Deploy. Depois aplique o schema e os fundadores (seção 8).
5. Copie a URL pública da API (ex.: `https://…up.railway.app`).

## 5) Web no Vercel
1. vercel.com → **Add New Project** → importe `GenBreedAI`.
2. **Root Directory**: `apps/web`. **Não existe `vercel.json` neste repo** — build e install vêm da configuração do projeto no Vercel
   (a confirmar no painel).
3. Variáveis da seção 3.2 (normalmente nenhuma é necessária).
4. Deploy.

## 6) Domínio genbreed.com.br
1. Vercel → projeto web → **Settings** → **Domains** → adicione `genbreed.com.br` (e `www`) e siga o DNS.
2. (Imagens) se usar domínio custom no R2 (`img.genbreed.com.br`), configure o CNAME no Cloudflare e use-o em `R2_PUBLIC_URL`.

## 7) Sequência de uma mudança com migração

Use esta ordem sempre que o `apps/api/src/db/schema.ts` mudar:

1. **Backup no Neon** do banco de produção antes de qualquer alteração (ex.: um branch do Neon criado a partir de produção, ou o
   procedimento de backup do time — **informado; não está documentado no repo**). Confirme que o backup existe.
2. **`db:migrate` em produção** — com a `DATABASE_URL` de produção no ambiente (shell local ou shell do Railway):
   ```
   pnpm --filter @genbreedai/api db:migrate
   ```
   As migrações ficam em `apps/api/drizzle/` (geradas por `db:generate` a partir do `schema.ts`, commitadas junto do código).
   Como o código antigo continua no ar até o passo 4, prefira migrações **aditivas** (coluna/tabela nova) — renomear ou apagar
   coluna derruba a versão antiga durante a janela.
3. **Conferir o schema** no banco: as tabelas/colunas novas existem (ex.: `\d nome_da_tabela` no psql ou o editor SQL do Neon) e a
   última linha de `drizzle.__drizzle_migrations` corresponde à migração aplicada.
4. **Merge na `main`** → deploy automático no Vercel e no Railway (**informado**).
5. **Verificar a API no ar:** não há rota de health dedicada. Confira (a) o deploy do Railway concluído e sem erro/`ABORTADO` nos
   logs (e sem o aviso `[quota] … IGNORADA`, que indica variável proibida presente); (b) `GET /api/v1/billing/packs` responde
   200 com os 3 pacotes; (c) no site: login e a tela da incubadora carregam.

> **Atenção — `users.first_gestation_at` e `users.first_gestation_entry_id` (ADR-0025, duas colunas na mesma migração):** o Drizzle enumera todas as colunas do schema em todo `select()`/`insert` de
> `users`. Fazer o merge do código que a declara **antes** de aplicar a migração dessa coluna quebra **login e cadastro** em produção
> (não só a gestação). A migração é aditiva (coluna nullable): aplique-a primeiro; o código antigo continua funcionando com ela.
> Contas existentes ficam com `NULL` e ganham a cortesia de 5 minutos na próxima gestação (backfill = decisão do dono).

> **Deploy do fuso único (ADR-0029, 2026-09-19) — sem migração de schema, mas com ajuste de dados opcional.** O bônus diário e a cota mensal de retratos
> passam a usar o dia/mês civil de **São Paulo** (antes UTC, que virava às 21h de Brasília). Para ninguém perder o bônus do dia seguinte, faça o deploy e rode o
> `UPDATE` do ADR-0029 (seção "Transição") **na mesma noite, entre 21:00 e 23:59 de Brasília, depois do deploy**; em outro horário, deixe como está. Evite fazer
> o deploy na última noite (21h–23h59) de um mês (cota mensal). Conferir antes: `SELECT last_daily, count(*) FROM wallets WHERE last_daily > to_char((now() AT
> TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') GROUP BY last_daily;`.

Se o passo 2 ou 3 falhar: **não faça o merge**. Restaure pelo backup do passo 1 se o banco ficou inconsistente.

## 8) Banco novo ou vazio: schema + fundadores
```
pnpm --filter @genbreedai/api db:migrate   # cria/atualiza o schema
pnpm --filter @genbreedai/api db:seed      # semeia os fundadores (ADITIVO: onConflictDoNothing, não apaga nada)
```
`db:seed` é idempotente: pode rodar de novo sem risco — insere só os fundadores que ainda não existem e **não altera** os já
existentes (nem os retratos, nem os dados de jogadores). Fundador que já existe com genótipo diferente do código **não** é
atualizado por ele; isso exige uma decisão explícita, nunca `db:reset`.

Retratos dos fundadores (custo de fal.ai; exige `FAL_KEY` e as cinco `R2_*`):
```
pnpm --filter @genbreedai/api images:regenerate-founders --missing                                   # dry-run (padrão): só lista
pnpm --filter @genbreedai/api images:regenerate-founders --missing --apply --confirm-bucket=<bucket> --max=<N>
```
`images:seed` também gera os retratos que faltam, mas sem dry-run. Prefira `regenerate-founders`.

### Miniaturas dos retratos (ADR-0027) — `sharp`

Todo retrato novo grava também `generated/<cacheKey>_thumb.jpg` (600×600 JPEG, < 200 KB), usada na og:image do WhatsApp. Precisa do
`sharp` na API — **dependência ainda não instalada**. Ordem:
1. `pnpm --filter @genbreedai/api add sharp` e commitar `apps/api/package.json` **e** `pnpm-lock.yaml` juntos (o Dockerfile usa
   `--frozen-lockfile`: `package.json` alterado sem o lockfile derruba o build da API).
2. Deploy. Sem o `sharp` nada quebra: o retrato é salvo e a miniatura falha com aviso `[thumbnail]` no log; a prévia cai no original.
3. Retratos gerados **antes** não têm miniatura — backfill (só lê o PNG do R2 e redimensiona; **não** chama a fal.ai nem altera o original):
```
pnpm --filter @genbreedai/api images:backfill-thumbs                                          # dry-run (padrão): lista tudo (todas as páginas) e conta: retratos / com miniatura / faltam
pnpm --filter @genbreedai/api images:backfill-thumbs --apply --confirm-bucket=<bucket> [--max=<N>]
```
O token do R2 precisa poder gravar/listar/ler qualquer chave do bucket (o backfill usa List/Get/Put); o token de produção da API já grava.
Depois de subir, o WhatsApp guarda em cache a prévia antiga de um link por um tempo — teste com um link novo ou aguarde.

### Notificações (Web Push) — "Gestação concluída" (ADR-0028)

O jogador é avisado quando a gestação termina (o nascimento em si é sempre ele quem dispara). O aviso sai de um **cron externo do
Railway** que roda `push:dispatch` a cada 5 minutos (serviço `push-cron`). **Status: em produção (informado)** — aviso confirmado em
Android; iPhone e desktop ainda não verificados. Os passos abaixo ficam como referência para recriar o ambiente:

1. **Dependência** `web-push` (já instalada): `pnpm --filter @genbreedai/api add web-push` (e `-D @types/web-push` se quiser os
   tipos) e commitar `apps/api/package.json` **e** `pnpm-lock.yaml` juntos (o Dockerfile usa `--frozen-lockfile`). Sem ela nada quebra: o
   recurso só falha na hora de enviar, e o `push:dispatch` aborta com erro **antes** de marcar qualquer entrada.
2. **Migração** (gerada com `pnpm --filter @genbreedai/api db:generate` e aplicada): cria a tabela `push_subscriptions`, a coluna
   `incubator_entries.ready_notified_at` e os índices `incubator_entries_gestation_ends_idx` e `push_subscriptions_user_idx`. Aplicar
   **antes** do merge (seção 7) — o Drizzle enumera todas as colunas: código novo sem a coluna quebra `GET /incubator`, gestar e nascer.
   Todas as entradas existentes ficam com `ready_notified_at = NULL`: na primeira execução do cron elas são **reivindicadas** (marcadas)
   sem enviar nada, pois ninguém tem assinatura ainda.
3. **Chaves VAPID** — gere UMA vez (não rode de novo: trocar a chave invalida todas as assinaturas):
   ```
   npx web-push generate-vapid-keys
   ```
   `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` no Railway (API **e** no serviço do cron), `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (a mesma pública) no
   Vercel, e redeploy da web. `VAPID_SUBJECT` opcional.
4. **Cron do Railway:** novo serviço a partir do MESMO repositório/Dockerfile, com as variáveis `DATABASE_URL`, `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY` (e `VAPID_SUBJECT`), **comando de início** `pnpm --filter @genbreedai/api push:dispatch` e **agendamento**
   `*/5 * * * *` (o mínimo do Railway é 5 minutos — a gestação de 5 minutos da 1ª vez pode avisar até 5 minutos depois). O processo
   sai sozinho ao terminar; **não** use o `start:prod` nesse serviço.
5. **Ler o log de cada execução** — nunca fica mudo:
   ```
   ENCONTRADAS: n | AVISADAS: n | SEM ASSINATURA: n | FALHAS: n
   Usuários: n | Assinaturas removidas (404/410): n
   ```
   `Web Push DESLIGADO …` = faltam as chaves (sai 0, nada marcado). Saída 1 = erro ou FALHAS > 0 (aviso perdido: a entrada é marcada
   ANTES do envio — "no máximo uma vez").
6. **Avisos de assinatura (ADR-0030) — o MESMO cron, sem serviço novo.** Depois do resumo da gestação o script imprime mais duas linhas:
   ```
   ASSINATURAS — CANDIDATAS: n | AVISOS: n (vence em breve: n, pagamento falhou: n, voltou ao gratuito: n)
   ASSINATURAS — AVISADOS: n | SEM PUSH: n | PULADOS: n | FALHAS: n
   ```
   Avisa por push "vence em N dias" (≤ 3 dias antes do fim, só quem não renova sozinho), "o pagamento falhou" e "voltou para o plano gratuito", cada um
   UMA vez por período de assinatura. A faixa no app (`GET /me/subscription-notice`) funciona sem o cron e sem VAPID. **Migração obrigatória antes do
   merge:** 3 colunas nullable em `subscriptions` (`expiry_notice_for`, `payment_failed_notice_for`, `dropped_notice_for`) — gerar com `db:generate`
   (**ainda não gerada**) e aplicar antes (seção 7): sem elas, código novo quebra a resolução de tier de TODOS os pedidos (o Drizzle enumera as colunas). No
   primeiro rodar depois da migração recebem aviso as assinaturas hoje em `PAST_DUE`, com cancelamento agendado a ≤ 3 dias do fim ou canceladas há ≤ 2 dias.

Limitação do iPhone: notificação só com o app **instalado na tela inicial** (pelo Safari) e **iOS 16.4+** (ADR-0026/0028).

## 9) Stripe (produção)
- **Webhook:** endpoint `https://<API>/api/v1/billing/webhook`, com o segredo em `STRIPE_WEBHOOK_SECRET`. Eventos tratados:
  `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- **Catálogo por `lookup_key`** (o código nunca usa `price_id`; a chave precisa existir e estar **ativa** no Stripe, senão a
  compra responde 400):
  - pacotes de crédito: `pack_10_v2` (R$ 5,90), `pack_30_v2` (R$ 14,90), `pack_60_v2` (R$ 29,90);
  - assinaturas: `junior_mensal`, `junior_anual`, `senior_mensal`, `senior_anual`, `phd_mensal`, `phd_anual`.
- Preços em BRL. Arquivar um Price no Stripe exige antes atualizar `apps/api/src/billing/credit-packs.ts` /
  `subscription-plans.ts`.

## 10) Checklist final (produção)
- [ ] Backup do Neon feito e migração aplicada **antes** do merge (seção 7).
- [ ] `DATABASE_URL` definido (em produção a API se recusa a subir sem ela — se o deploy falhar no boot com `DATABASE_URL inválida`, a variável sumiu/está malformada no Railway).
- [ ] `AUTH_SECRET` forte e único (≥ 32 caracteres; a API se recusa a subir sem ele em produção — se o deploy falhar no boot com `AUTH_SECRET inválida`, a variável sumiu/está fraca no Railway).
- [ ] Trocar o `AUTH_SECRET` **invalida todas as sessões** (todo mundo precisa logar de novo) — faça de propósito, nunca "sem querer".
- [ ] **Nenhuma** variável da seção 3.3 existe no Railway.
- [ ] As **cinco** `R2_*` definidas (em produção com `FAL_KEY` a API se recusa a subir sem elas, e também com só algumas — se o deploy falhar no boot com `R2 inválido em produção`, alguma sumiu/está vazia no Railway). O boot só confere presença: teste ainda assim gerando um retrato e confirmando que a URL aponta para o R2.
- [ ] `FAL_KEY` definido; `FAL_MODEL` indefinido ou `fal-ai/flux-2-pro`.
- [ ] `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL` e `STRIPE_CANCEL_URL` definidos (as duas URLs em `https://` do domínio real, nunca localhost); webhook cadastrado no Stripe. **Com a chave definida a API se recusa a subir sem os outros três** — se o deploy falhar no boot com `Stripe inválido em produção`, alguma sumiu/está vazia/aponta para localhost no Railway. O boot só confere presença e forma: não sabe se o segredo é o do endpoint certo (teste com um pagamento real de baixo valor ou o "Enviar evento de teste" do Stripe).
- [ ] `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`: as **duas** ou nenhuma (metade derruba o boot em produção). `NEXT_PUBLIC_VAPID_PUBLIC_KEY` da web = a pública da API (o boot da API não consegue conferir isso).
- [ ] **Antes do merge deste ADR:** conferir no Railway (serviço da API) as variáveis acima — o próximo deploy falha no boot se algo estiver fora da regra. O serviço `push-cron` não é afetado.
- [ ] `lookup_key`s do catálogo Stripe ativas (seção 9).
- [ ] `API_URL` do web coerente com a URL da API (ou o padrão do `next.config.mjs` ainda válido).
- [ ] Domínio propagado.

## Notas
- **Imagens:** só com as cinco `R2_*` o `storage.ts` grava/serve do bucket; sem elas cai no disco local do container (só dev — em produção o boot barra esse caso, ADR-0031).
- **Referral (ADR-0024):** `POST /referral/event` **não existe mais** (nunca deve voltar — permitia crédito infinito). Os marcos são
  tratados só no servidor: o registro (`POST /auth/register` e `/auth/google` aceitam o campo opcional `ref`) apenas GRAVA o vínculo
  indicador → indicado, **sem crédito** (cadastro é farmável); quem paga é o webhook do Stripe quando a assinatura do indicado fica
  `active` (JUNIOR 15 créditos · SENIOR 30 · PHD 1 mês do plano do indicador). Por isso o webhook precisa estar configurado
  (`STRIPE_WEBHOOK_SECRET`) para o indicador ser recompensado. **Rev. 2 (2026-09-19):** a **compra de pacotes de créditos** do indicado também paga (a cada 3 pacotes iguais do MESMO indicado: 3×10 → 2 · 3×30 → 5 ·
  3×60 → 10 créditos, por tamanho, acumulando) e **D1/D7 foram cancelados** — indicado no Free nunca gera crédito. **Migração pendente e obrigatória
  antes do merge:** tabelas `referral_pack_purchases` e `referral_pack_trios` (seção 7); as colunas `d1`/`d7` continuam no banco (não dropar junto do
  deploy — quebraria o código antigo na janela). Erro ao recompensar no webhook
  responde 500 de propósito — o Stripe reenvia.
- **Nunca** aponte `DATABASE_URL` de produção para um script destrutivo (`db:reset`) nem para `db:backfill-sex --apply` sem ler o
  cabeçalho do script (`--confirm-host=<host igual ao de DATABASE_URL>` é obrigatório).
