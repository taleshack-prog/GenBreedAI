# ADR-0031 — Trava de boot do R2 (storage de imagens)

- **Status:** aceito · **Data:** 2026-09-19
- **Segue o padrão de** `common/auth-secret.ts` e `common/database-url.ts` (`assert…ForBoot()` em `buildApp()`).
  **Não muda** `images/storage.ts` nem a regra de quando o R2 é usado (as cinco variáveis juntas).

## Contexto

`images/storage.ts` só usa o Cloudflare R2 com AS CINCO variáveis (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`). Faltando qualquer uma, o storage grava no DISCO do contêiner: a API
sobe, tudo parece funcionar e os retratos gerados (custo real de fal.ai) somem no próximo deploy, sem aviso. Era a
pendência 6 do `CLAUDE.md`, com uma proposta condicional que o dono aprovou.

Restrições: produção com cobrança real; o modo procedural (sem `FAL_KEY`) não gera nem guarda nada, então R2 é dispensável
nele; a mensagem de erro não pode vazar credenciais (há chave secreta entre as cinco).

## Decisão

Nova função `assertR2ForBoot()` (`apps/api/src/common/r2-config.ts`), chamada em `buildApp()` depois de
`assertAuthSecretForBoot()` e `assertDatabaseForBoot()`:

1. **Produção** (`NODE_ENV === "production"`) **com `FAL_KEY`** definida: as cinco `R2_*` são obrigatórias; faltando
   qualquer uma o boot **lança** (processo sai com código 1, `[boot] A API NÃO subiu`).
2. **Produção com configuração PARCIAL** (1 a 4 das cinco): o boot **lança MESMO sem `FAL_KEY`** — é erro de digitação ou
   variável apagada, não escolha.
3. **Produção sem `FAL_KEY` e sem nenhuma `R2_*`**: passa (modo procedural), com aviso `[storage] modo PROCEDURAL …` 1x por
   processo.
4. **Fora de produção** nada falha: avisa 1x por processo (`[storage] R2 incompleto … DISCO LOCAL … NÃO persistem`) só
   quando as imagens cairiam no disco (com `FAL_KEY` sem R2 completo, ou R2 parcial); silêncio quando as cinco existem ou
   quando não há `FAL_KEY` nem R2.
5. **Mensagens só com NOMES de variável, nunca valores.** "Definida" = não vazia após `trim()`; a checagem só barra
   AUSÊNCIA (não valida formato), para não derrubar um deploy que hoje funciona.

Testes (`apps/api/test/r2-config.spec.ts`): as quatro combinações; faltando cada uma das cinco, individualmente, em produção
com `FAL_KEY` (`it.each`); parcial de 1 a 4; vazio/espaço = faltando; nenhum valor nas mensagens; `buildApp()` real.
`auth-secret.spec.ts` e `database-url.spec.ts` passaram a isolar `FAL_KEY` e as `R2_*` (o `main.ts` carrega o `.env` local
por dotenv, e o boot em produção agora valida o R2).

## Consequências

- Um deploy de produção com `FAL_KEY` e R2 incompleto **deixa de subir** — deliberado; a versão anterior segue no ar
  enquanto o Railway não promover a nova (depende de healthcheck: **a confirmar**). **Ação antes do merge:** conferir no
  Railway que as cinco `R2_*` estão definidas e não vazias, senão o próximo deploy falha no boot.
- A trava confere só presença: `R2_PUBLIC_URL`/`R2_BUCKET` errados (não vazios) ou token sem permissão continuam sem aviso.
  O teste do checklist do `DEPLOY.md` (gerar um retrato e ver a URL) segue necessário.
- Quem quiser um ambiente de produção sem imagens (ex.: staging barato) remove `FAL_KEY` e todas as `R2_*`.
- Lê `process.env` no boot; o `storage.ts` continua avaliando as variáveis no import — não há mudança de comportamento em
  runtime, só o boot passa a recusar a combinação perigosa.

## Adendo — escopo: só o boot HTTP, nunca os scripts de linha de comando

Risco levantado após a primeira entrega: o serviço `push-cron` do Railway roda `pnpm --filter @genbreedai/api push:dispatch`
com `NODE_ENV=production` e SÓ `DATABASE_URL`, `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (sem `FAL_KEY`, sem `R2_*`, sem
`AUTH_SECRET`). Se o script passasse por `buildApp()`, o cron quebraria no deploy.

**Verificação (leitura de código):** não passa. Os três `assert…ForBoot()` são chamados **só** em `main.ts` (`buildApp()`,
linhas 24–27). `push/dispatch-ready-cli.ts` (linhas 18–30) importa `db/client`, `common/clock`, `common/vapid`, os repositórios
Drizzle, `PushService`, `WebPushSender`, `TierService` etc. — nenhum importa `main.ts`, `app.module.ts` nem `common/auth-secret`,
`common/database-url`, `common/r2-config`. `resolveAuthSecret()` só é chamada dentro de `AuthService` (assinar/verificar JWT), que
só o módulo HTTP (`auth.controller`/`auth.guard`/`auth.module`) importa. Os demais scripts (`db:seed`, `db:migrate`, `db:reset`,
`db:backfill-sex`, `images:seed`, `images:regenerate-founders`, `images:backfill-thumbs`) têm o mesmo perfil: cada um lê
diretamente só o que usa (`DATABASE_URL` nos de banco e no cron; `FAL_KEY`/`R2_*`/`FAL_MODEL` nos de imagem; VAPID no cron).

**Decisão:** a regra fica explícita — validações de boot são do processo HTTP; script de linha de comando valida só o que usa
e não importa o boot. Nenhuma mudança de código foi necessária; foi adicionado `test/cli-boot-isolation.spec.ts`, que (a) descobre
os scripts no `package.json`, (b) caminha pelo grafo de imports em tempo de execução de cada um e falha se alcançar `main.ts`,
`app.module.ts`, os três módulos de guarda ou `auth.service`, (c) garante que as chamadas `assert…ForBoot()` existem só em
`main.ts`, e (d) importa os módulos do cron em produção sem `AUTH_SECRET`/`FAL_KEY`/`R2_*`. Guarda de boot nova = função
`assert…ForBoot()` chamada só em `buildApp()`, e o módulo dela entra na lista `FORBIDDEN` do teste.

**Limitação:** o teste é estático — não cobre um script que faça `require()` dinâmico com caminho calculado nem um `import type`
que vire runtime. E o `images:seed`/`images:regenerate-founders` (que usam `FAL_KEY` e `storage.ts`) têm as próprias checagens
locais, inalteradas por este ADR.

## Varredura: outras variáveis cuja ausência degrada em silêncio (nenhuma travada por este ADR)

| Variável | Efeito de faltar/estar errada | Gravidade |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` ausente | Webhook responde 400: o jogador PAGA no Stripe e nada é creditado nem ativado (pacotes, assinaturas, indicação). | **Alta** — dinheiro real sem entrega |
| `STRIPE_SECRET_KEY` ausente | Billing cai no provider stub (sem cobrança real); compras não funcionam e não avisam. | Média |
| `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` ausentes | Checkout redireciona para `localhost:3000` (padrão de dev). | Média |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` só uma definida | Push desliga; só o `push:dispatch` aborta com erro. | Baixa (recurso opcional) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` ≠ VAPID da API (web) | Assinaturas aceitas, envio falha. | Baixa |
| `R2_PUBLIC_URL`/`R2_BUCKET` com valor errado (não vazio) | URLs de retrato quebradas; a checagem só vê presença. | Média |
| `GOOGLE_CLIENT_ID` ausente | Login Google responde 400; e-mail/senha segue. | Baixa (documentado, opcional) |

Proposta (não aplicada, decisão do dono): em produção, exigir `STRIPE_WEBHOOK_SECRET` sempre que `STRIPE_SECRET_KEY` estiver
definida, e recusar `STRIPE_SECRET_KEY` ausente quando as URLs de Checkout de produção estiverem definidas (configuração
incoerente); recusar VAPID pela metade. Cada uma seguiria o mesmo padrão `assert…ForBoot()`.

## Alternativas consideradas

- **Só avisar no log em produção:** rejeitada — é o estado atual disfarçado; ninguém lê o log antes de perder as imagens.
- **Sempre exigir as cinco em produção, com ou sem `FAL_KEY`:** rejeitada — obrigaria credenciais R2 num ambiente
  procedural que não grava nada.
- **Validar formato/alcançar o bucket no boot (HEAD/PUT de teste):** rejeitada por ora — rede no boot, risco de derrubar
  o deploy por instabilidade do Cloudflare; a checagem de presença cobre o erro real (variável faltando).
- **Lançar em runtime na primeira gravação:** rejeitada — o nascimento já teria gasto a vaga e o custo do fal.ai.
