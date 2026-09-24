# ADR-0039 — Health check central (`GET /api/v1/health/summary`)

- **Status:** aceito · **Data:** 2026-09-24
- **Não muda** regra de jogo nem schema (nenhuma tabela nova, nenhuma migração). Só leitura.

## Contexto

A Hack Tech Farm tem um painel central que faz PULL a cada minuto nos apps monitorados, com `Authorization: Bearer <token>`. A rota mora na **API** (Railway) — é ela que fala com banco,
R2, Stripe e fal.ai. URL: `https://genbreedaiapi-production.up.railway.app/api/v1/health/summary` (o host do Railway vem de `apps/web/next.config.mjs`; o proxy da web também a expõe
em `/api/v1/health/summary`, mas o painel deve apontar para a API).

## Decisão

**Rota** (`apps/api/src/health/`): `HealthController` (`@Controller("api/v1/health")`, `@Get("summary")`), **fora do `AuthGuard`**.
- `MONITOR_TOKEN` ausente/vazio → **503 sem corpo** (nunca libera por omissão; o boot não falha). Sem cabeçalho ou token errado → **401 sem corpo**. Comparação em tempo constante
  (`crypto.timingSafeEqual` sobre SHA-256 dos dois lados — nem o comprimento vaza).
- Autenticado → **HTTP 200 sempre**, mesmo com tudo fora; 500 (sem corpo) só se a própria rota quebrar. `Cache-Control: no-store`.
- Corpo: `{ app: "GenBreed", status, detail (≤ 200 chars, "" se tudo ok), checked_at (ISO UTC), checks: [{ name, status, detail }] }`; `status` do topo = o PIOR entre os checks.
- **Orçamento:** 8 checks EM PARALELO, timeout individual de 2s (≤ 6s no total por construção); estouro → `degraded` ("não respondeu em 2s"); erro → `down` com frase FIXA
  ("falha ao consultar") — a mensagem do erro (que poderia trazer string de conexão) nunca vai para o corpo. **Cache de 30s** da resposta inteira, com as chamadas simultâneas
  compartilhando a mesma rodada. Tempo via `Clock`.
- **Sem segredo no corpo:** só números e frases curtas; nomes de variável (não valores) na config. Teste varre o corpo por todos os segredos do ambiente e por e-mails.

| Check | ok | degraded | down |
|---|---|---|---|
| `banco` | `SELECT 1` responde | estourou o timeout | falhou |
| `migracoes` | aplicadas (`drizzle.__drizzle_migrations`) == entradas do journal `drizzle/meta/_journal.json` | banco à frente dos arquivos; journal ausente | faltando: "N pendentes; primeira: <tag>" |
| `config` | variáveis críticas presentes (reaproveita `databaseUrlProblem`, `authSecretProblem`, `r2Status`, `stripeProductionProblems`, `vapidProblem`) + `FAL_KEY`, `STRIPE_SECRET_KEY` | — | faltando/inválida: só os NOMES |
| `fal_ai` | Usage API responde (chave ADMIN); custo do mês < 80% do teto | ≥ 80% do teto; **sem `FAL_ADMIN_KEY`** (só estimativa) | erro |
| `r2` | `ListObjectsV2` de 1 objeto; ocupação < 80% do teto | ≥ 80% | erro |
| `stripe` | `balance.retrieve` responde; eventos recentes | sem evento há > 24h (ou nenhum); não configurado | erro |
| `cron_push` | gestação vencida sem aviso mais antiga ≤ 5 + 3 min (ou nenhuma) | até o dobro | acima do dobro |
| `gestacoes` | nenhuma vencida há +24h sem aviso | qualquer uma, com a contagem | — |

Push desligado (sem `VAPID_*`) → `cron_push` e `gestacoes` ficam ok (o `push:dispatch` não reivindica nada de propósito).

## Os dois problemas (reportados antes de improvisar)

1. **`cron_push` — o `push:dispatch` não registra que rodou.** Sem persistência não há "última execução". **Implementado sem schema novo:** a execução é INFERIDA pela gestação vencida mais antiga
   ainda sem aviso (`incubator_entries.ready_notified_at` nulo, `born_specimen_id` nulo): o cron reivindica toda gestação vencida em ≤ 5 min. **Limite:** sem gestação vencida pendente o
   check não tem como confirmar que o cron rodou (o detail diz "execução inferida, não registrada"); cron morto só é visto quando há alguém a avisar. **Solução exata (exige schema):** uma linha de
   heartbeat — tabela mínima `job_runs(job text PK, last_run_at timestamptz, last_status text)` escrita pelo `push:dispatch` no fim de cada execução; `db:generate` + migração. Não criada.
2. **`fal_ai` — custo do mês.** A fal.ai EXPÕE: Usage API `GET https://api.fal.ai/v1/models/usage?start=…&end=…&expand=summary`, `Authorization: Key <chave ADMIN>`, resposta com `summary[].cost_total`
   (USD). Exige chave **admin**, diferente da `FAL_KEY` de geração → variável nova **`FAL_ADMIN_KEY`**. Sem ela: estimativa por imagens (nascimentos não-fundadores do mês + `image_quota.used`)
   × US$ 0,03 (`FAL_IMAGE_COST_USD`) — é aproximação (ignora cache hit e regeneração paga com crédito). **Teto:** `FAL_MONTHLY_CAP_USD` (env); sem ele o custo aparece e o check diz "teto não configurado".
   Nenhum teto existia antes.

## Limites conhecidos

- **Último webhook do Stripe** não é gravado: o proxy é o maior `updated_at` de `subscriptions`/`payment_intents`. Em app de pouco movimento, "sem evento há +24h" pode disparar sem defeito
  (`STRIPE_WEBHOOK_MAX_SILENCE_HOURS` ajusta).
- **Ocupação do R2:** o R2 não tem API de quota — é a soma da listagem de `generated/`, remedida em segundo plano a cada 10 min (a primeira resposta diz "ocupação sendo medida"). Teto: `R2_STORAGE_CAP_GB`.
- O adapter Drizzle do health (`health-data.drizzle.ts`, só SELECTs) não tem teste contra Postgres/PGlite; os testes cobrem a lógica com fakes.

## Alternativas consideradas

- *Rota na web (Vercel):* rejeitada — quem fala com banco, R2, Stripe e fal.ai é a API.
- *Tabela de histórico:* rejeitada (pedido: sem histórico).
- *`cron_push` por heartbeat agora:* exige migração — adiado para aprovação.
- *Contar imagens × preço como único custo:* mantido só como fallback; a Usage API é a fonte exata.
