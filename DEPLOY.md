# Deploy do GenBreedAI — passo a passo (genbreed.com.br)

Arquitetura em produção:
- **Web** (Next.js) → **Vercel**
- **API** (NestJS) → **Railway** (via Docker)
- **Banco** (Postgres) → **Neon** (já em uso)
- **Imagens** (PNG da IA) → **Cloudflare R2** (bucket + CDN)
- **Domínio** → genbreed.com.br (Vercel para o site; subdomínio para imagens)

O web fala com a API por um **proxy same-origin** (`/api/*` → API_URL), então não há CORS.

---

## 1) Neon (banco) — já existe
Você já tem a `DATABASE_URL` da Neon. Guarde-a. Depois do deploy da API, rode as migrações uma vez (passo 4.4).

## 2) Cloudflare R2 (imagens)
1. Painel Cloudflare → **R2** → **Create bucket** → nome `genbreed-images`.
2. No bucket → **Settings** → **Public access**: habilite **R2.dev subdomain** (ou conecte um domínio custom, ex.: `img.genbreed.com.br`). Copie a **Public URL** (algo como `https://pub-xxxx.r2.dev` ou o subdomínio custom).
3. Cloudflare → **R2** → **Manage R2 API Tokens** → **Create API token** (permissão *Object Read & Write* no bucket). Anote **Access Key ID**, **Secret Access Key** e o **Account ID** (aparece na URL do painel / em R2).
4. Você terá: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=genbreed-images`, `R2_PUBLIC_URL=<a public URL do passo 2>`.

## 3) Segredos que você vai precisar
- `DATABASE_URL` (Neon)
- `AUTH_SECRET` — gere: `openssl rand -hex 32`
- `FAL_KEY` (fal.ai)
- `FAL_MODEL=fal-ai/flux/dev` e (opcional) `FAL_MODEL_PHD=fal-ai/flux-pro/v1.1`
- R2_* (passo 2)
- (opcional Google) `GOOGLE_CLIENT_ID`
- **Produção:** `AUTH_DEV_HEADERS=false`, `IMAGE_QUOTA_UNLIMITED=false`, `CROSS_QUOTA_UNLIMITED=false`

## 4) API no Railway
1. railway.com → **New Project** → **Deploy from GitHub repo** → selecione `GenBreedAI`.
2. Em **Settings** do serviço:
   - **Root Directory**: `/` (raiz do repo)
   - **Build**: Dockerfile → **Dockerfile Path**: `apps/api/Dockerfile`
   - (o `railway.json` na raiz já aponta isso)
3. **Variables** (Environment): cole todos os segredos do passo 3 (DATABASE_URL, AUTH_SECRET, FAL_KEY, FAL_MODEL, FAL_MODEL_PHD, R2_*, GOOGLE_CLIENT_ID, e os três `*_UNLIMITED=false`/`AUTH_DEV_HEADERS=false`). O Railway injeta `PORT` sozinho.
4. Deploy. Quando subir, **rode as migrações uma vez** (Railway → Shell do serviço, ou local apontando a mesma DATABASE_URL):
   ```
   pnpm --filter @genbreedai/api db:migrate
   pnpm --filter @genbreedai/api db:reset       # semeia os fundadores
   pnpm --filter @genbreedai/api images:seed     # (opcional) pré-gera retratos → vão pro R2
   ```
5. Copie a **URL pública da API** (ex.: `https://genbreedai-api.up.railway.app`).

## 5) Web no Vercel
1. vercel.com → **Add New Project** → importe `GenBreedAI`.
2. **Root Directory**: `apps/web` (o `vercel.json` na raiz já define build/install; se o Vercel pedir, use Root = apps/web).
3. **Environment Variables**:
   - `API_URL` = a URL da API do Railway (passo 4.5) — **sem** `/api` no fim.
   - (opcional) `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = mesmo client id do Google.
4. Deploy.

## 6) Domínio genbreed.com.br
1. Vercel → projeto web → **Settings** → **Domains** → adicione `genbreed.com.br` (e `www`). Siga as instruções de DNS (aponte no seu registrador para a Vercel).
2. (Imagens) se usar domínio custom no R2 (`img.genbreed.com.br`), configure o CNAME no Cloudflare conforme o passo 2.

## 7) Checklist final (produção)
- [ ] `AUTH_DEV_HEADERS=false` (sem isso, qualquer um vira "demo").
- [ ] `IMAGE_QUOTA_UNLIMITED=false` e `CROSS_QUOTA_UNLIMITED=false` (cotas ativas = margem protegida).
- [ ] `AUTH_SECRET` forte e único.
- [ ] Migrações rodadas (db:migrate).
- [ ] R2_* corretos (teste: gere um retrato e confirme a URL apontando pro R2).
- [ ] `API_URL` no Vercel apontando pro Railway.
- [ ] Domínio propagado (pode levar minutos/horas).

## Notas
- **Imagens:** com R2_* definidos, o `storage.ts` grava/serve do bucket automaticamente; sem eles, cai no disco local (só dev).
- **Pagamento:** o checkout está em modo stub (aprova na hora). Para cobrar de verdade, implemente `PixPaymentProvider`/`StripePaymentProvider` em `apps/api/src/billing/payment.provider.ts` e ligue em `resolvePaymentProvider()`.
- **Referral D1/D7/convert:** os marcos install já disparam no cadastro; D1/D7/convert automáticos são o próximo passo (hoje via endpoint `/referral/event`).
