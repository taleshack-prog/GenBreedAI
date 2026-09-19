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
| `FAL_KEY` | fal.ai (geração de retrato) | Modo procedural: nascimentos ficam **sem retrato de IA**; nada é cobrado nem gerado. |
| `FAL_MODEL` | Modelo de imagem. Opcional; padrão `fal-ai/flux-2-pro`, o **mesmo para todo tier** | Usa o padrão. **Não defina `FAL_MODEL_PHD`** — é ignorada (aviso no log). |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Storage de imagens no R2 | Se **qualquer uma das cinco** faltar (em especial `R2_PUBLIC_URL`), o storage cai para o **disco local do container**: as imagens somem no próximo deploy/restart e as URLs não apontam para o R2. **O boot NÃO barra isso** (só `AUTH_SECRET` e `DATABASE_URL` barram) — a API sobe e perde as imagens em silêncio; confira o teste do checklist (gere um retrato e veja a URL). |
| `STRIPE_SECRET_KEY` | Chave **live** (`sk_live_…`) do Stripe | O billing cai no **provider stub de dev** (não cobra de verdade); assinaturas e webhook ficam indisponíveis. Não é inseguro (em produção o `/billing/confirm` do stub fica bloqueado, seção 3.3), mas as compras **não funcionam e não avisam** — a API sobe normal. |
| `STRIPE_WEBHOOK_SECRET` | Verifica a assinatura de `POST /api/v1/billing/webhook` | O webhook responde 400: pagamentos feitos no Stripe **nunca creditam** pacote nem ativam/atualizam assinatura. |
| `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` | Retorno do Checkout | O Checkout redireciona para `http://localhost:3000/...` (padrão de dev): o cliente paga e volta para o localhost. Use as URLs de `genbreed.com.br` (ex.: `/app/profile?billing=success&session_id={CHECKOUT_SESSION_ID}` e `/app/profile?billing=cancel`). |
| `GOOGLE_CLIENT_ID` | Login Google (opcional) | O login Google responde 400 ("não configurado"); e-mail/senha segue funcionando. |
| `NODE_ENV=production` | Já definido no `Dockerfile` — **não sobrescreva** | É o que faz o código ignorar as flags de dev (seção 3.3) **e** exigir `AUTH_SECRET` e `DATABASE_URL` válidas no boot. Sem ele a API roda em modo "dev" (segredo padrão inseguro e dados em memória incluídos). |
| `PORT` | O Railway injeta | — |

### 3.2 Web (Vercel)
- `API_URL` — **opcional**: em produção o `next.config.mjs` já aponta por padrão para a API pública do Railway. Defina só se a
  URL da API mudar (sem `/api` no fim).
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — opcional; sem ela o botão de login Google não aparece.

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
- [ ] As **cinco** `R2_*` definidas (teste: gere um retrato e confirme que a URL aponta para o R2).
- [ ] `FAL_KEY` definido; `FAL_MODEL` indefinido ou `fal-ai/flux-2-pro`.
- [ ] `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL` e `STRIPE_CANCEL_URL` definidos; webhook cadastrado no Stripe.
- [ ] `lookup_key`s do catálogo Stripe ativas (seção 9).
- [ ] `API_URL` do web coerente com a URL da API (ou o padrão do `next.config.mjs` ainda válido).
- [ ] Domínio propagado.

## Notas
- **Imagens:** só com as cinco `R2_*` o `storage.ts` grava/serve do bucket; sem elas cai no disco local do container (só dev).
- **Referral (ADR-0024):** `POST /referral/event` **não existe mais** (nunca deve voltar — permitia crédito infinito). Os marcos são
  tratados só no servidor: o registro (`POST /auth/register` e `/auth/google` aceitam o campo opcional `ref`) apenas GRAVA o vínculo
  indicador → indicado, **sem crédito** (cadastro é farmável); quem paga é o webhook do Stripe quando a assinatura do indicado fica
  `active` (JUNIOR 15 créditos · SENIOR 30 · PHD 1 mês do plano do indicador). Por isso o webhook precisa estar configurado
  (`STRIPE_WEBHOOK_SECRET`) para o indicador ser recompensado. **D1/D7 ainda não creditam** (dependem de tarefa agendada). Erro ao recompensar no webhook
  responde 500 de propósito — o Stripe reenvia.
- **Nunca** aponte `DATABASE_URL` de produção para um script destrutivo (`db:reset`) nem para `db:backfill-sex --apply` sem ler o
  cabeçalho do script (`--confirm-host=<host igual ao de DATABASE_URL>` é obrigatório).
