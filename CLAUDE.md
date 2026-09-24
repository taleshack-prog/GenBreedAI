# CLAUDE.md — GenBreedAI

Guia de contexto para o agente de código (Claude Code) neste repositório.

Leia este arquivo inteiro antes de qualquer tarefa. Ele é lido como contrato: as regras da seção 2 são não negociáveis.
Última conferência contra o código e os ADRs: 2026-09-18. Itens que não foi possível confirmar no repo estão marcados
como **(informado)** ou **(a confirmar)** — não trate esses como fato verificado.

---

## 1. Identidade e fase

GenBreedAI (genbreed.com.br): game de genética aplicada a animais (web PC + mobile). O jogador cruza espécies, estuda
herança mendeliana e quantitativa real e tenta fixar fenótipos — ou falha. Imagens de retrato geradas por IA (FLUX.2 pro),
com cache determinístico.

**O projeto está EM PRODUÇÃO**, com cobrança real:

| Peça | Onde |
|---|---|
| Web (Next.js) | Vercel — proxy same-origin `/api/*` → API (`apps/web/next.config.mjs`; `API_URL`, com padrão apontando pro Railway em produção) |
| API (NestJS + Fastify) | Railway, via `apps/api/Dockerfile` + `railway.json` |
| Banco (PostgreSQL) | Neon |
| Imagens | Cloudflare R2 (disco local só em dev, quando `R2_*` não está definido; em produção o boot exige as cinco `R2_*` quando há `FAL_KEY`, ADR-0031) |
| Pagamentos | Stripe (Checkout de pacotes, assinaturas e webhook) — **live (informado)**; não verificável pelo código |

- Nada de "fase de construção": não existe mais o bloqueio "sem UI/API até a auditoria". Features novas são mergeáveis
  desde que respeitem a seção 2 e a Definition of Done (seção 11).
- A Fase 0 do motor (`packages/engine`) está implementada. A **auditoria formal do motor atual está PENDENTE** — ver
  seção 6 (pendência registrada, não bloqueio).

## 2. Regras não negociáveis

1. **Fonte única de verdade, na ordem:** (a) o código e os ADRs em `docs/adr/` (o mais recente vence); (b)
   `docs/gene-bank/*.md` para loci/alelos; (c) `docs/TDD-GenBreedAI.md` e `docs/PRD-GenBreedAI.md`. A **TDD §6 (tiers) e
   parte da §7 estão desatualizadas** frente ao código (descrevem cota de cruzamento e bônus semanal, ADR-0019) — em
   conflito, vale o código + ADRs. Não invente espécies, loci, alelos, valores de F, probabilidades ou regras fora dessas
   fontes.
2. **Anti-P2W:** as probabilidades do motor são imutáveis por tier. `cross()` é tier-agnóstico (não recebe tier). Tier
   altera só: vagas de nascimento, retratos extras, bônus, pool de espécies e ferramentas — nunca o resultado genético.
   Todo PR que toca o motor inclui teste de paridade entre tiers.
3. **Determinismo:** mesmo genótipo + mesmo método + mesmo seed = mesmo resultado (cache de IA e fairness). Tempo de regra
   de negócio vem de `Clock` (`apps/api/src/common/clock.ts`), nunca de `new Date()` direto em serviço.
4. **Golden tests 100% verdes** antes de qualquer feature. Ficam em `packages/engine/src/__tests__/golden/`
   (goldendoodle, boerpointer, danecollie, pumajaguar, tortoiseshell).
5. **Moderação de imagem:** toda imagem gerada por IA passa por moderação antes de ser exibida (só `ImageJob.status =
   APPROVED`). **Estado real:** `moderate()` (`apps/api/src/images/moderation.ts`) hoje aprova sempre e depende do
   `safety_checker` do fal — moderação própria é pendência conhecida (seção 6). Não venda isso como moderação completa.
6. **Ambiguidade:** escolha a interpretação mais conservadora e registre em ADR (`docs/adr/`, formato na seção 12).
7. **Sem stubs falsos:** não entregue mock/stub que finja funcionar em produção (pagamento, moderação, cota). Stubs de dev
   precisam estar atrás de flag que produção ignora.
8. **Não implemente nada do não-escopo** (seção 13).

## 3. Documentos de referência

| Arquivo | Papel |
|---|---|
| `docs/adr/` | Decisões de arquitetura/regra. **Fonte mais recente** (ADR-0001 a 0037) |
| `docs/gene-bank/felinos-genetica.md`, `docs/gene-bank/caninos-genetica.md` | Loci, dominâncias e portadores ocultos de cada pack — fonte dos data packs |
| `docs/Gene-Bank.md` | Gene-Bank original (Fase 0); as extensões por pack acima prevalecem |
| `docs/TDD-GenBreedAI.md` | Spec de engenharia (05/09/2026). Motor (§4) e golden tests (§4.5) seguem canônicos; **§6 tiers desatualizada** |
| `docs/PRD-GenBreedAI.md` | Requisitos de produto — o porquê das decisões |
| `docs/errata/fase0-errata.md` | Correções textuais da Fase 0 ao TDD/Gene-Bank |
| `docs/audit/fase0-audit.md`, `fase0-audit-v2.md` | Pareceres da Fase 0 (05/09 e 06/09) — ver seção 6 |
| `docs/specialists/especialista-genetica-aplicada.md` | Prompt de sistema do auditor científico |
| `DEPLOY.md` | Infra e operação: variáveis de ambiente (obrigatórias e proibidas), sequência de mudança com migração, Stripe. Atualizado em 2026-09-18 (seção 10 resume) |

## 4. Estrutura do monorepo

```
genbreedai/
├── apps/
│   ├── web/        # Next.js 15 (App Router) + Tailwind — telas do jogo, planos, páginas legais
│   └── api/        # NestJS + Fastify — REST /api/v1; drizzle/ (migrações), Dockerfile, src/db/ (scripts)
├── packages/
│   ├── engine/     # Motor genético em TS puro, determinístico, sem I/O (data packs felino/canino)
│   └── shared/     # Tipos, DTOs, catálogo de espécies/raças, constantes
├── docs/           # adr/, gene-bank/, audit/, errata/, specialists/, TDD, PRD, ...
├── DEPLOY.md  railway.json  turbo.json  pnpm-workspace.yaml  CLAUDE.md
```

## 5. Stack e comandos

- Gerenciador: pnpm 9 + Turborepo. Node 22 (Dockerfile). TypeScript estrito.
- Web: Next.js 15, React 19, Tailwind 3. PWA instalável (ADR-0026): `public/manifest.webmanifest` + `public/sw.js` **mínimo, sem cache
  offline** (registrado só no cliente/produção); **não há `next-pwa`** e nada de cache offline sem ADR. Ícones PNG oficiais em `public/` (192, 512, maskable 512,
  apple-touch 180; cromossomo com bandas, fundo `#070b11`); o `icon.svg` **não é mais referenciado** (arte antiga, órfão). Push: ver ADR-0028 abaixo.
- API: NestJS 10 + Fastify 4, Drizzle ORM (0.36) sobre PostgreSQL (genoma em JSONB), `pg` (Neon) / PGlite nos testes.
  Auth **própria**: JWT (`jsonwebtoken`) + `bcryptjs` + login Google (`google-auth-library`). Imagens: fal.ai + Cloudflare
  R2 (`@aws-sdk/client-s3`). Pagamentos: Stripe.
- Arquitetura da API: portas (classes abstratas `*Repository`) com adapter in-memory (dev/teste) e adapter Drizzle
  (ADR-0005/0006). Sem `DATABASE_URL`, tudo roda em memória — **só fora de produção**: com `NODE_ENV=production` a API não sobe sem
  ela (seção 10).
- **Não existem hoje:** Redis, BullMQ, Auth.js/NextAuth, Playwright, chat. **Nenhum processo agendado DENTRO da API** (cron/job/fila):
  tudo roda por requisição — limpezas são preguiçosas (ex.: incubadora, ADR-0023). **Única exceção externa (ADR-0028):** um cron do
  Railway (a cada 5 min) executa o script `push:dispatch`, que avisa por Web Push as gestações concluídas; a API em si continua sem agendador.
- **Web Push (ADR-0028):** `apps/api/src/push/` (assinaturas, envio, `dispatch-ready`); `public/sw.js` trata `push` e o clique; botão
  "Avisar quando nascer" no Perfil e na Incubadora. **Desligado sem `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`** (nada quebra). Requer a
  dependência `web-push` (instalada). **Em produção (informado):** cron `push-cron` a cada 5 min; aviso "Gestação concluída" confirmado em
  aparelho Android. No iPhone só com o app instalado na tela inicial e iOS 16.4+ (não verificado em iPhone). Nenhum texto da web pode tratar
  o aviso como futuro — há teste que varre o código (`pwa-files.test.ts`).
- Testes: Vitest (unit, golden e "e2e" via `app.inject` do Fastify).

| Comando | O que faz |
|---|---|
| `pnpm install` | Instala dependências |
| `pnpm dev` | Web (3000) + API (3001) em dev |
| `pnpm build` | Build de todos os pacotes |
| `pnpm test` | Todos os testes (unit + golden) |
| `pnpm test:golden` | Só os golden tests do motor |
| `pnpm typecheck` | `tsc --noEmit` em cada pacote |
| `pnpm lint` | **No-op hoje** — os scripts de lint dos apps são `echo 'skip'` (pendência, seção 6) |

Scripts da API (`pnpm --filter @genbreedai/api <script>`): `db:generate`, `db:migrate`, `db:seed`, `db:reset`,
`db:backfill-sex`, `images:seed`, `images:regenerate-founders`, `images:backfill-thumbs`, `push:dispatch`. Operação na seção 10.

## 6. Pendências registradas (não bloqueiam features)

1. **Auditoria formal do motor atual (Fase 0) — PENDENTE.** Existem pareceres APROVADO de 05/09 (`fase0-audit.md`,
   condicionado à errata) e 06/09 (`fase0-audit-v2.md`, modelo STR/SPD/DEF/RES/COL/PAT), mas o motor mudou depois:
   packs felino/canino, sexo cromossômico e locus O (ADR-0013), efeito materno (0014), Haldane por sexo (0015/0018),
   loci limitados ao sexo (0017), loco S canino (0022) etc. Nenhum parecer cobre isso. Quando for feita, seguir o fluxo:
   assumir o papel de `docs/specialists/especialista-genetica-aplicada.md`, recalcular F de Wright e probabilidades de
   forma independente, verificar determinismo, paridade anti-P2W e a separação `F_pedigree` (biologia) × `IF` (jogo), e
   registrar o parecer em `docs/audit/` (matriz de achados com severidade e nível de evidência GRADE, checklist dos
   golden tests, status APROVADO/REPROVADO). Enquanto pendente: não declare o motor "auditado".
2. **Moderação de imagem própria** não existe (`moderate()` aprova sempre; regra 5 da seção 2).
3. **`pnpm lint` é no-op** (há `eslint.config.js` na raiz, mas nenhum script o executa).
4. **TDD §6/§7 desatualizadas** frente ao código (tiers, cotas, bônus, chat descrito mas inexistente).
5. **Referral — D1/D7 CANCELADOS** (ADR-0024, rev. 2, 2026-09-19): indicação só recompensa quando o indicado GASTA; indicado no Free nunca
   gera crédito. As colunas `d1`/`d7`/`d1_credited`/`d7_credited` seguem no schema como `@deprecated` (sem escritor nem leitor) até uma
   migração futura de DROP — dropar junto do deploy quebraria o código antigo na janela migrar→deploy. **Pendência:** a migração das 2 tabelas
   novas da compra de pacotes (`referral_pack_purchases`, `referral_pack_trios`) ainda NÃO foi gerada (`db:generate`) — aplicar antes do merge.
   **Carteira (ADR-0029, 2026-09-19): corrigida.** Todo ajuste de saldo/cota virou `UPDATE` atômico (`addImageCredits`, `takeImageCredit`,
   `addResources`, `spendResources`, `claimDaily`, `claimBiweekly`, `tryConsume`). Achado por leitura de código, não reproduzido: o `save` antigo de
   `charge`/`credit`/`claimDaily` regravava a carteira inteira e **zerava os créditos comprados** — conferir a produção (jogadores que perderam créditos).
   **Tempo (ADR-0029, adendo):** `WalletService` e `ImageQuotaService` agora usam `Clock`. **Fuso único (ADR-0029, decisão 2026-09-19):** o jogo tem UM "dia" —
   o dia civil de São Paulo — para o bônus diário, o mês da cota de retratos e a vaga de nascimento (`common/sao-paulo-time.ts`; bônus quinzenal é intervalo
   entre instantes, sem fuso). **Ao subir: ajuste de dados opcional** (SQL no ADR-0029, seção "Transição": rodar na mesma noite do deploy, entre 21h e 23h59
   de Brasília, senão quem coletou nessa noite perde o bônus do dia seguinte); a cota mensal não tem ajuste confiável. **Tier efetivo com `Clock` (ADR-0029):** o `TierService` lê o
   `Clock` e passa o `now` aos repositórios (`findActiveForUser(userId, now)`) — expiração de `granted_tiers` e `PAST_DUE` testáveis; nenhum outro ponto do servidor
   decide regra pela data do sistema (sobram só auditoria/ids/cache). Na web, duas cópias de exibição da regra `PAST_DUE` usam `Date.now()` (não gateiam nada).
6. **Travas de boot da API (ADR-0031 e adendo 2) — APLICADAS:** R2 (`common/r2-config.ts`), Stripe (`common/stripe-config.ts`: com
   `STRIPE_SECRET_KEY` em produção, `STRIPE_WEBHOOK_SECRET` e as URLs https não-localhost são obrigatórias) e VAPID pela metade
   (`common/vapid-config.ts`). **Ainda degradam em silêncio (o boot só confere presença/forma, não correção):** `R2_PUBLIC_URL`/`R2_BUCKET`
   com valor ERRADO (não vazio); `STRIPE_WEBHOOK_SECRET` presente mas de OUTRO endpoint/modo (assinatura nunca confere → 400); URL de retorno
   https para o domínio errado; `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (web) diferente da VAPID da API (envio falha); `STRIPE_SECRET_KEY` ausente
   passa com aviso (billing desligado, por escolha). **Ação antes do merge:** conferir no Railway (serviço da API) que as variáveis
   cumprem as regras — senão o próximo deploy falha no boot (o `push-cron` não é afetado).
7. **`sharp` não instalado na API** (ADR-0027): sem ele nenhuma miniatura é gerada (o retrato é salvo normalmente, com aviso no log).
   Instalar com `pnpm --filter @genbreedai/api add sharp` e commitar `package.json` + `pnpm-lock.yaml` juntos (Dockerfile usa
   `--frozen-lockfile`). Retratos anteriores à ADR-0027 ficam sem miniatura até rodar `images:backfill-thumbs`.
8. **Web Push (ADR-0028) — no ar (informado).** Subida concluída: `web-push` instalada, migração aplicada, chaves VAPID definidas, cron
   `push-cron` rodando `push:dispatch` a cada 5 min, aviso confirmado em aparelho Android. **Ainda não verificado:** iPhone (app instalado,
   iOS 16.4+) e desktop. Ver DEPLOY.md §8 para a operação e a ordem de uma recriação.
9. Comentários antigos no `schema.ts` ("Stripe inexistente", "Auth.js") e ADR-0008 (criaturas procedurais, "aceito")
   não refletem o estado atual.

## 7. Convenções de código

- TypeScript estrito: proibido `any` sem ADR justificando.
- Motor (`packages/engine`): TS puro, sem I/O, sem dependências externas; toda função pura e determinística sob seed.
- Código e identificadores em inglês; comentários e docs em português.
- Commits convencionais: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.
- **Vitest não checa tipos.** Rode `pnpm typecheck` além dos testes — um método abstrato esquecido em um adapter só
  aparece em execução ("is not a function"). Ao adicionar método a uma porta (`*Repository`), implemente-o nos DOIS
  adapters (in-memory e Drizzle) e nos fakes de teste que o exercitem.
- Mudança de schema (`apps/api/src/db/schema.ts`) exige migração gerada (`db:generate`) e registro; nunca aplicada pelo deploy.
- **Saldos e contadores (ADR-0029): todo ajuste é UM `UPDATE ... SET x = x ± n [WHERE <condição>] RETURNING` (ou `INSERT ... ON CONFLICT DO UPDATE`) —
  NUNCA leitura seguida de escrita** (`get` + `save`). A condição ("tem saldo?", "já coletou?", "cabe na cota?") vai no `WHERE`; cada operação só toca as
  colunas que muda (proibido regravar a linha/carteira inteira); o adapter em memória faz o método inteiro sem `await` entre ler e gravar. Vale para
  carteira, cotas, bônus, claims e contadores novos, nos DOIS adapters. Escreva o teste de concorrência (`Promise.all`) junto.
- **Tempo (regra 3 + ADR-0029):** regra de negócio que depende de "agora" lê `Clock` injetado — nunca `new Date()`/`Date.now()` num serviço. Testes fixam o
  relógio com `SystemClock.setForTesting(...)` (nunca `vi.useFakeTimers()` com `app.inject()`). Construtor com `clock: Clock = new SystemClock()` quando há muitos
  chamadores diretos; o módulo importa `ClockModule`.
- Nenhum merge sem `pnpm test:golden` e `pnpm typecheck` verdes (e `pnpm test`).

## 8. Regras de produto em vigor (conferidas em `tiers.ts`, `tier-access.ts`, ADRs 0016/0019–0023)

**O limite do jogo é o NASCIMENTO** (é onde a imagem custa). Cruzar é livre.

- **Fluxo:** cruzar → gestar → nascer.
  - **Cruzar:** livre e ilimitado, com limite TÉCNICO de 60 chamadas/hora de `POST /cross`, igual para todo tier (anti-abuso).
    Gera **6 opções de fenótipo** por cruzamento, igual para todo tier (pode haver menos se o par não segrega — as opções
    são agrupadas por fenótipo). Não gera imagem nem espécime: grava descrições na incubadora.
  - **Gestar:** consome 1 vaga de nascimento (`birthQuota`) — ver tabela. Sem vaga, usa 1 crédito; sem os dois, 429 com
    `nextAvailableAt`. Gestações simultâneas não têm teto. Não existe acelerar gestação.
  - **Nascer:** só depois do prazo da gestação; gera a imagem (FLUX.2 pro), cria o espécime, sem custo novo.
- **Vagas de nascimento por tier:**

  | Tier | Vagas | Janela | Bônus quinzenal | Retratos extras/mês | Árvore |
  |---|---|---|---|---|---|
  | FREE | 1 | a cada 7 dias (móvel) | não | 0 | 1 |
  | JUNIOR | 3 | a cada 7 dias (móvel) | sim | 0 | 3 |
  | SENIOR | 1 | por dia civil (America/Sao_Paulo) | sim | 15 | 7 |
  | PHD | 3 | por dia civil (America/Sao_Paulo) | sim | 20 | completa (+ acesso ao Mercado) |

- **Gestação por aura:** 1★ 12h · 2★ 18h · 3★ 24h · 4★ 36h · 5★ 48h (`gestation-time.ts`; regra de produto, vive na API,
  nunca no motor). **Exceção (ADR-0025): a PRIMEIRA gestação de cada conta dura 5 minutos, qualquer aura** (cortesia de
  boas-vindas, 1x por conta); a marca é `users.first_gestation_at` + `first_gestation_entry_id` (claim atômico, nunca muda — não se deduz das
  entradas, que somem; a entrada acelerada se identifica pelo id, não por instante). Só o prazo muda: a 1ª gestação consome vaga/crédito normalmente. **Em produção desde 18/09 (informado: migração 0011
  aplicada e commit publicado — não verificável pelo repo).**
- **Incubadora** (ADR-0020/0021/0023): guarda as descrições não gestadas sem prazo, com **teto de 200 não gestadas por
  jogador** — ao cruzar, as mais antigas não gestadas são descartadas até caber (`POST /cross` devolve `discardedForCap`);
  nunca descarta entrada em gestação nem nascida. Entrada **nascida some 7 dias corridos após o nascimento**; o espécime
  fica no Gene Bank para sempre. Limpeza preguiçosa (em `GET /incubator` e `POST /cross`), sem job agendado.
- **Crédito avulso = 1 nascimento extra** (usado quando não há vaga). Também é o fallback quando acaba a cota mensal de
  retratos extras (regenerar retrato). Pacotes (`credit-packs.ts`): **10 por R$ 5,90 · 30 por R$ 14,90 · 60 por R$ 29,90**.
  Ganha-se crédito por compra, indicação (referral) e bônus quinzenal.
- **Indicação (referral, ADR-0024):** o `?ref=` é capturado em qualquer página pública e enviado no cadastro; os marcos são creditados
  **só no servidor** (nunca por rota pública — a antiga `POST /referral/event` foi removida por permitir crédito infinito). Cadastro de
  usuário novo com código válido só **grava o vínculo** indicador→indicado (1x por indicado; auto-indicação por id/e-mail/alias não vincula)
  e **não credita nada** (sem verificação de e-mail seria farmável). **Só a assinatura paga:** assinatura do indicado ativa no Stripe
  (webhook): JUNIOR +15 créditos · SENIOR +30 · PHD = 1 mês grátis do plano do indicador em `granted_tiers` (FREE ganha 1 mês de JUNIOR),
  1x por indicado. **Também a COMPRA DE PACOTES de créditos (rev. 2, ADR-0024):** a cada 3 pacotes IGUAIS comprados pelo MESMO indicado, o indicador
  ganha 2 (pacote de 10) · 5 (de 30) · 10 (de 60) créditos — baldes independentes por tamanho, o resto acumula, sem limite; compras de indicados
  diferentes não se somam; idempotente por pagamento (`ReferralService.recordPackPurchase`, chamado pelo webhook). Só recompensa quando o indicado
  GASTA: indicado no Free nunca gera crédito (D1/D7 cancelados). O indicado não ganha nada.
- **Bônus quinzenal:** +1 crédito, janela móvel de 15 dias, a partir do JUNIOR. A **recompensa diária de recursos**
  (catalisadores/biomassa) continua diária, por tier (`wallet.service.ts`).
- **UM único "dia" (ADR-0029): o dia civil de São Paulo** (`America/Sao_Paulo`, `common/sao-paulo-time.ts`, sem deslocamento fixo — acerta horário de verão
  se voltar) vale para a vaga de nascimento diária, o bônus DIÁRIO (vira à meia-noite de Brasília) e o **mês** da cota de retratos extras (vira à meia-noite do
  dia 1 de Brasília). O bônus quinzenal é intervalo entre instantes e não depende de fuso. Regra nova que precise de "dia"/"mês" do jogador usa este módulo.
- **Pool de espécies** (ADR-0016; espécie fora do pool responde 404, "escondida, sem cadeado"):
  FREE só *Felis catus* (intraespécie) · JUNIOR + felinos selvagens e cruzamentos entre espécies · SENIOR + cães (todas as
  raças do catálogo) · PHD tudo o que existe — hoje igual ao Senior, pois grandes animais ainda não têm fundador nem
  `poolGroup`. Não adicionar pool sem ADR.
- **Tier efetivo** é resolvido no servidor (`TierService.resolve`): assinatura Stripe ativa → concessão (`granted_tiers`,
  ex.: prêmio de indicação) → FREE. O tier nunca vem cru do JWT/header (o `x-user-tier` só vale com `AUTH_DEV_HEADERS=true`).
- **Imagem:** modelo único **FLUX.2 pro** (`fal-ai/flux-2-pro`, `FAL_MODEL`), o mesmo para todo tier (`FAL_MODEL_PHD` é
  ignorada). Gerada no nascimento; além disso há retratos pré-gerados dos fundadores (`images:seed`) e regeneração de
  retrato de espécime próprio (cota de retratos extras/créditos). Cache determinístico por `cacheKey` = hash(genótipo +
  pack + versão da arte [+ sexo, só quando o sexo muda a aparência]) — qualquer mudança de genótipo de fundador força
  novo retrato. Armazenamento no R2. **Miniatura (ADR-0027):** ao gravar o retrato também se grava `generated/<cacheKey>_thumb.jpg`
  (600×600 JPEG, < 200 KB) para a og:image do WhatsApp (o original passa de 1 MB e é ignorado); melhor-esforço — falha na miniatura
  só gera log, nunca impede o retrato. `GET /public/specimens/:id` devolve `thumbUrl` (ou `null` → a web cai no original).
- **Planos:** assinaturas Stripe mensal/anual (JUNIOR/SENIOR/PHD, por `lookup_key` — nunca hardcode `price_id`); o webhook
  é a fonte do ciclo de vida da assinatura. Preços de planos: `apps/web/lib/plans.ts` e Stripe.

## 9. Modelo de dados (`apps/api/src/db/schema.ts`; migrações em `apps/api/drizzle/`, 0000–0010)

| Tabela | Papel |
|---|---|
| `users` | id, email, nome, `password_hash`, `google_id`, `tier`, streak, xp, `first_gestation_at`, `first_gestation_entry_id` (nullable; ADR-0025, migração 0011 aplicada — informado) |
| `specimens` | Espécimes e fundadores. Genótipo/fenótipo em JSONB; `sex`, `fertility`, `haldane_status` (anuláveis, ADR-0015; legado fica NULL), `included_portrait` ("vale" de retrato da ADR-0019, hoje `false` nos nascimentos), `status` (ALIVE/FROZEN), `cache_key`, `created_at` (= instante do nascimento, base do ciclo de vida, ADR-0023), `breed` (text anulável — raça: gato de raça = id da raça, cão = espécie, nascido = a dos pais se igual, senão nulo; ADR-0033 adendo 2; **migração NÃO gerada — `db:generate` e aplicar antes do merge**, senão todo select de `specimens` quebra) |
| `incubator_entries` | Descrições geradas por cruzamento: `cross_id`, genótipo/fenótipo, `prob`, aura, `sex`, `gestation_started_at`, `gestation_ends_at`, `born_specimen_id`, `ready_notified_at` (aviso "Gestação concluída" já reivindicado, ADR-0028; migração pendente); `frozen` é órfão (sem escritor). Índices `(owner_id, created_at)` e `gestation_ends_at` |
| `push_subscriptions` | Assinaturas de Web Push por dispositivo (ADR-0028; migração pendente): `user_id`, `endpoint` (único), `p256dh`, `auth`, `user_agent`, `created_at`, `last_used_at`, `failed_at` |
| `cross_reservations` | Reservas do limite técnico de 60/h de `POST /cross` |
| `birth_reservations` | Reservas das vagas de nascimento (`birthQuota`). Ambas: `RESERVED`/`CONFIRMED`; `RESERVED` com mais de 10 min não conta |
| `wallets` | catalisadores, biomassa, `last_daily`, `last_biweekly`, `image_credits` |
| `image_quota` | Uso mensal de retratos extras por usuário (`owner_id`, `ym`, `used`) |
| `referral_links`, `referral_referred` | Indicação e marcos já creditados (anti-duplo-crédito); colunas `d1`/`d7` `@deprecated` (ADR-0024 rev. 2) |
| `referral_pack_purchases`, `referral_pack_trios` | Compras de pacote de créditos por INDICADO (1 linha por pagamento, `payment_id` PK) e trios já pagos por (`referred_id`, `pack_id`) — ADR-0024 rev. 2; migração pendente |
| `payment_intents` | Compras de pacote; PK = id do gateway → crédito idempotente sob retry de webhook |
| `subscriptions` | Assinaturas Stripe (tier, intervalo, status, fim do período); `expiry_notice_for`, `payment_failed_notice_for`, `dropped_notice_for` = período (`current_period_end`) para o qual o aviso já foi reivindicado (ADR-0030; migração pendente) |
| `granted_tiers` | Tiers concedidos fora do Stripe, com expiração |
| `crosses` | Legada, nunca escrita pelo fluxo atual |

## 10. Operação

- **Deploy:** web (Vercel) e API (Railway) sobem a partir do GitHub; **deploy automático da `main` (informado)** — não há
  workflow de CI no repo. O container só inicia (`start:prod`); `main.ts` não migra.
- **Migração NUNCA roda sozinha no deploy.** Aplicar **antes** do deploy que a exige, com **backup no Neon (informado —
  não está documentado no repo)**: `pnpm --filter @genbreedai/api db:migrate` com a `DATABASE_URL` alvo. `db:generate`
  gera a migração a partir do `schema.ts`.
- **`db:reset` é destrutivo:** apaga TODOS os espécimes e cruzamentos e re-semeia os fundadores. Trava: exige
  `ALLOW_DB_RESET=yes-destroy-all-data` e, se o host for Neon, também `ALLOW_DB_RESET_REMOTE=yes`. **Só para ambiente local
  vazio** — nunca em banco com dados de jogadores. Para semear fundadores use `db:seed` (aditivo, `onConflictDoNothing`).
  Ordem de uma mudança com migração: backup no Neon → `db:migrate` em produção → conferir schema → merge na `main` → verificar
  a API (detalhes em `DEPLOY.md`).
- **`db:backfill-sex`:** dry-run por padrão; `--apply` só grava com `--confirm-host=<host igual ao de DATABASE_URL>`.
- **`images:regenerate-founders`:** dry-run por padrão; `--apply` exige `--confirm-bucket=<bucket real>` e `--max=N` acima de 10 retratos.
- **`images:backfill-thumbs`** (ADR-0027): dry-run por padrão (lista TODAS as páginas do R2 e conta retratos / com miniatura / faltam — sempre impresso,
  inclusive com zero faltando); `--apply` exige `--confirm-bucket=<bucket real>`, `--max=N` opcional; progresso a cada 10 e `GERADAS: n | FALHAS: n` no fim.
  Só lê o PNG e grava `_thumb.jpg` — sem fal.ai, sem tocar no original. Requer `sharp`. Falha na listagem → erro + saída 1; config PARCIAL do R2 → aborta.
- **`push:dispatch`** (ADR-0028): roda no cron externo do Railway a cada 5 min. Reivindica (`UPDATE … WHERE ready_notified_at IS NULL … RETURNING`) as
  gestações vencidas, não nascidas e não avisadas, e manda o push "Gestação concluída"; sem cota, sem custo, idempotente, "no máximo uma vez".
  Sempre imprime `ENCONTRADAS | AVISADAS | SEM ASSINATURA | FALHAS`; sem VAPID → "DESLIGADO", sai 0 sem marcar nada; erro ou falhas → saída 1.
  Precisa de `DATABASE_URL`, das chaves VAPID e de `web-push`. Assinatura que devolve 404/410 é apagada. **Segundo passo, no MESMO cron (ADR-0030):**
  avisos de assinatura — "vence em N dias" (≤ 3 dias antes, só quem não renova sozinho: cancelamento agendado ou `PAST_DUE`), "o pagamento falhou" e "voltou para o
  plano gratuito" (queda recente e jogador mesmo no Free) — cada um UMA vez por período (`subscriptions.expiry_notice_for`/`payment_failed_notice_for`/`dropped_notice_for`,
  claim atômico). A faixa correspondente vem de `GET /me/subscription-notice` (servidor decide; regra de vigência única `isSubscriptionInForce`, ADR-0029) e mora no
  layout de `/app/*`. **Migração das 3 colunas ainda NÃO gerada — aplicar antes do merge** (código novo sem elas quebra a resolução de tier de todos os pedidos).
- **Flags de dev** (`common/dev-flags.ts`, `isDevFlagEnabled` — a função ÚNICA; flag nova de dev usa ela): `QUOTA_UNLIMITED_DEV` (e o
  alias depreciado `CROSS_QUOTA_UNLIMITED`), `IMAGE_QUOTA_UNLIMITED`, `AUTH_DEV_HEADERS` e `BILLING_STUB_ENABLED` são **ignoradas quando
  `NODE_ENV=production`**, mesmo definidas, com aviso no log 1x por processo. Mesmo assim, não as defina em produção (`DEPLOY.md` §3.3).
- **Segredos/env** (ver `apps/api/.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `FAL_KEY`, `FAL_MODEL`, `R2_*`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL`, `GOOGLE_CLIENT_ID`.
  Sem `STRIPE_SECRET_KEY` o billing cai no provider stub de dev (sem cobrança real).
  **`AUTH_SECRET` é obrigatório em produção** (`common/auth-secret.ts`): com `NODE_ENV=production` a API **não sobe** sem um valor
  válido (≥ 32 caracteres, sem placeholder/padrão de dev) — `buildApp()` lança e o processo sai com código 1; `AuthService` também se
  recusa a assinar/verificar JWT sem ele. Fora de produção o padrão inseguro de dev continua, com aviso no log 1x por processo.
  **`DATABASE_URL` também é obrigatória em produção** (`common/database-url.ts`, mesmo lugar e padrão: `buildApp()` lança, saída 1):
  sem ela tudo cairia nos repositórios em memória e os dados sumiriam a cada reinício, em silêncio. Fora de produção o modo em
  memória continua, com aviso "os dados NÃO persistem" 1x por processo. **Boot novo = função `assert…ForBoot()` chamada em `buildApp()`.**
  **O R2 também é validado no boot** (`common/r2-config.ts`, ADR-0031): em produção com `FAL_KEY` as cinco `R2_*` (`R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`) são obrigatórias; configuração PARCIAL (1 a 4) falha
  MESMO sem `FAL_KEY`; sem `FAL_KEY` e sem nenhuma `R2_*` passa (modo procedural) com aviso 1x por processo. Fora de produção nada
  falha — só avisa quando as imagens cairiam no disco local (não persistem). Mensagens só com NOMES de variável, nunca valores.
  **Stripe também é validado no boot** (`common/stripe-config.ts`, ADR-0031 adendo 2): em produção com `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_SUCCESS_URL` e `STRIPE_CANCEL_URL` são obrigatórias, e as duas URLs precisam ser https e não apontar para localhost; sem a chave passa
  (billing desligado) com aviso 1x por processo; fora de produção só avisa (chave sem webhook secret). **VAPID pela metade** (`common/vapid-config.ts`)
  falha o boot em produção; as duas ou nenhuma passam. Mensagens só com NOMES de variável. Lista de guardas: `main.ts` → `buildApp()`.
  Os demais segredos ausentes falham FECHADO (login Google 400, sem fal.ai só o modo procedural) — nenhum tem fallback inseguro; o que ainda
  degrada em silêncio está na pendência 6 da seção 6 e no `DEPLOY.md` §3.1.
  **Guardas de boot valem SÓ para a API HTTP (`buildApp()`), nunca para scripts de linha de comando** — o `push-cron` do Railway tem só
  `DATABASE_URL` + `VAPID_*` com `NODE_ENV=production`; script novo não pode importar `main.ts`/`app.module.ts`/módulos de guarda
  (`test/cli-boot-isolation.spec.ts` falha se importar; o `push-cron` não tem variável do Stripe/R2/`AUTH_SECRET`). Guarda nova: chame `assert…ForBoot()` só em `buildApp()` e inclua o módulo na lista `FORBIDDEN` do teste.
  **Testes que chamam `buildApp()` em produção devem isolar `FAL_KEY`, as `R2_*`, `STRIPE_*` e `VAPID_*`** (o `main.ts` carrega o `.env` local por dotenv).

## 11. Definition of Done (todo PR)

- [ ] `pnpm test:golden` 100% verdes
- [ ] `pnpm typecheck` sem erros (Vitest não checa tipos — seção 7)
- [ ] `pnpm test` verde
- [ ] Anti-P2W: teste de paridade entre tiers sempre que o motor for tocado
- [ ] Portas: todo método abstrato novo implementado nos adapters in-memory E Drizzle
- [ ] Schema alterado → migração gerada e registrada; nada de migração automática no deploy
- [ ] Imagens: só exibidas com `ImageJob.status = APPROVED` (ver a ressalva da moderação, seção 2 regra 5)
- [ ] Privacidade: sem PII em logs/mensagens; páginas `termos`, `privacidade` e `reembolso` coerentes com o produto (não existe chat hoje)
- [ ] Performance: metas do TDD (bundle < 35MB; TTI < 3s em 4G médio) — **não medidas no repo (a confirmar)**
- [ ] ADR criado para qualquer decisão ambígua

## 12. ADR (Architecture Decision Record)

Template em `docs/adr/0000-template.md`; arquivos `docs/adr/00NN-titulo.md` (próximo: 0038). Formato mínimo: Contexto
(problema e restrições) · Decisão · Consequências (trade-offs, riscos) · Alternativas consideradas (e por que foram
rejeitadas). Decisão nova ganha ADR novo — não reescreva ADR aceito; supere-o com um novo.

## 13. Decisões de genética em vigor (ADRs 0013–0023) — o ADR é a fonte, não repita o conteúdo

- **0013** — Sexo cromossômico XX/XY e locus O (laranja) ligado ao X no pack felino.
- **0014** — Efeito materno no QTL `porte` (Walton & Hammond 1938).
- **0015** — Regra de Haldane condicionada ao sexo e classe de hibridação (`hybridClass`).
- **0016** — Pool de espécies por tier (`poolGroup`; fail-closed para espécie desconhecida).
- **0017** — Loci limitados ao sexo (juba `Ma`): fêmea nunca expressa.
- **0018** — Esterilidade de macho híbrido além do F1 (substitui a regra provisória do backfill).
- **0019** — Cotas persistidas, retrato incluído e bônus por tier. *Parcialmente superada pelas 0020/0021 (cota de cruzamento, bônus semanal).*
- **0020** — Incubadora: cruzar é livre; limite de 60/h técnico. *A "revelação" e o "congelamento" foram superados pela 0021.*
- **0021** — Gestação: o limite fica no nascimento; tempo por aura; bônus quinzenal.
- **0022** — Locus S canino: dominância completa → incompleta (S/s^p = branco residual).
- **0023** — Ciclo de vida da incubadora: nascida some em 7 dias; teto de 200 não gestadas.
- **0024** — (produto, não genética) Indicação server-side: cadastro só vincula (sem crédito), a assinatura do indicado paga; **rev. 2 (2026-09-19): só GASTAR recompensa — também a compra de pacotes (trios por indicado e por tamanho: 3×10→2, 3×30→5, 3×60→10); D1/D7 cancelados.**
- **0025** — (produto, não genética) Primeira gestação de cada conta = 5 min (cortesia, `users.first_gestation_at`); complementa a 0021.
- **0026** — (produto/web, não genética) PWA instalável: manifest + service worker mínimo sem cache offline; instruções na landing.
- **0027** — (produto/imagem, não genética) Miniatura 600×600 JPEG do retrato para a og:image do WhatsApp; melhor-esforço; backfill por script.
- **0028** — (produto/infra, não genética) Web Push: aviso "Gestação concluída" via cron externo do Railway (`push:dispatch`); assinaturas por dispositivo; desligado sem VAPID; limitação do iPhone.
- **0029** — (economia/infra, não genética) Saldos e contadores: todo ajuste é `UPDATE` atômico, nunca leitura seguida de escrita; carteira e cota mensal de retratos corrigidas.
- **0030** — (produto/infra, não genética) Avisos de assinatura: push no cron existente (`push:dispatch`, passo 2) + faixa no app (`GET /me/subscription-notice`); 3 momentos, uma vez por período, marcação atômica; não muda a regra de vigência.
- **0031** — (infra, não genética) Travas de boot da API: R2 (`common/r2-config.ts`: produção + `FAL_KEY` exige as cinco `R2_*`; parcial falha sempre; sem `FAL_KEY` e sem R2 passa com aviso); adendo 1: só o boot HTTP, nunca os scripts (`push-cron`); adendo 2: Stripe (com `STRIPE_SECRET_KEY`, webhook secret + URLs https não-localhost) e VAPID pela metade; fora de produção só avisa.
- **0032** — (produto/web, não genética) Página pública `/o-que-e` (sem login; fora do matcher do middleware): texto e JSON-LD (FAQPage + SoftwareApplication) saem da fonte única `apps/web/lib/about.ts`; preços/limites de `plans.ts`, espécies do catálogo; fato novo só com fonte, sem "em breve" nem espécie não implementada; teste confere JSON-LD × texto visível. Adendo: `app/sitemap.ts` e `app/robots.ts` (nativos do Next 15; rotas em `lib/public-routes.ts` — sitemap só com rotas públicas de conteúdo, nunca `/app/*` nem `/f/[id]`; robots bloqueia `/app/`); rota pública nova de conteúdo entra em `PUBLIC_ROUTES`.
- **0033** — (produto/imagem, não genética) O prompt nomeia a raça canina PURA nascida (species sem "×") em inglês (`DOG_BREED_ENGLISH_NAMES`, transcrito dos descritores), com a cor/morfologia calculadas prevalecendo; híbridos e fundadores inalterados; `terrier-anao-branco` sem nome (aguarda o dono); só gerações novas mudam de prompt. Adendo: gêmeos de fundador tratados como o base (`baseFounderId`); híbridos caninos com nome inglês + cláusula de prioridade; **adendo 2: campo `specimens.breed`** (`specimens/breed.ts`) — gato de raça nascido mantém a raça no prompt (`CAT_BREED_ENGLISH_NAMES`; tabby/preto/branco não são raça); mestiço = nulo; espécimes antigos nulos (fundador deriva do id); backfill SQL no ADR, não executado; **migração pendente**.
- **0034** — (produto/imagem, não genética) `fel()` aceita B e D (padrão B/B, D/D — nenhum fundador muda); prompt felino nomeia chocolate/azul/lilás/canela/fawn ("a solid … coat"), respeita B/D no melanismo e diz a cor dos pontos (seal mantém a frase antiga); `cacheKey` inalterada. Fundadores novos: decisão à parte.
- **0035** — (motor/imagem, genética-adjacente) Locus O (laranja) chega ao jogador: `hashGenotype` inclui `xLoci` (só quando existem — chaves de fundador inalteradas), a `cacheKey` do nascido passa a ver o X, o prompt lê `coatPigment` (laranja, creme, tartaruga, azul-creme, calico; laranja mascara preto/chocolate; S só na família laranja), o gêmeo de fundador trata o X (`twinGenotype`), `fel()` aceita `xLoci`; nenhum fundador laranja criado.
- **0036** — (produto/genética de dados) 16 fundadores de COR de gato (doméstico laranja/tartaruga/calico; Persa, Maine Coon, Abissínio, Ragdoll, Bengala) — só a cor muda; gêmeo trata o X (tartaruga F → macho `[o]`, dá a herança cruzada); `CAT_FOUNDER_COLOUR_VARIANTS` (variante → raça, alimenta `breed`); 74 → 90 bases / 180 espécimes; 20 retratos novos; Persa Preto não existe (o gêmeo da Persa Tartaruga é o persa preto). **Aplicar: `db:seed` + `images:seed`.**
- **0037** — (web/infra de imagem, não genética) Listas de espécimes (galeria de espécies, Gene Bank, incubadora) usam a miniatura da ADR-0027 com `loading="lazy"` e fallback para o original; a tela individual e as cartas do Laboratório mantêm o original. API: `thumbUrl` ADITIVO em `ImageResult` (`/specimens/:id/image`) e em `IncubatorEntryView`; `pickListImage`/`swapToFallback` em `lib/list-image.ts`. Cascata de N `getImage` por card fica como pendência.

Antes deles: 0001–0004 (correções da Fase 0), 0005/0006 (arquitetura hexagonal, Drizzle/PGlite), 0010–0012 (extensão
felina, loci morfológicos caninos, genética quantitativa). Portadores ocultos de fundadores: `docs/gene-bank/`.

## 14. Não-escopo (não implementar)

- Web3/on-chain/NFTs.
- **Mercado:** existe só como tela placeholder (`ComingSoon`, exclusivo PhD); leilão/escrow não estão implementados nem liberados.
- Bovinos, suínos e ovinos: **fora das promessas** (removidos do roadmap). **Equinos são a próxima família prevista
  (informado, sem ADR — a confirmar/registrar)**; nada de equinos antes de um ADR e de um data pack.
- Websockets complexos (usar polling/SSE), app nativo Swift/Kotlin, checkout multi-moeda.
- Chat comunitário: descrito na TDD §7.1, **não implementado**; não implemente sem decisão explícita.

## 15. A confirmar

- Stripe em modo live e deploy automático da `main` (informados; sem registro no repo).
- Procedimento de backup no Neon antes de migrar (informado; não documentado no repo).
- Se a migração 0010 (gestação, ADR-0021) já foi aplicada no Neon de produção.
- ADR-0025: em produção desde 18/09 (informado; migração 0011 aplicada). Ainda em aberto: se contas antigas devem ganhar a
  cortesia (hoje ganham, coluna `NULL`) ou receber backfill.
- PWA (ADR-0026): instalabilidade no Android/iPhone não verificada em aparelho real; Web Push (ADR-0028) confirmado em Android (informado), **não** em iPhone nem desktop; `public/icon.svg` órfão (arte antiga — apagar ou
  atualizar); sem tela de abertura do iOS (`apple-touch-startup-image`).
- Metas de performance (bundle/TTI): sem medição no repo.
- Preços dos planos (fonte: `apps/web/lib/plans.ts` e Stripe; a TDD §6 traz valores antigos).
