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

Proposta desta varredura: **aplicada no adendo 2 abaixo** (webhook secret, URLs de retorno e VAPID pela metade). Por decisão do
dono, `STRIPE_SECRET_KEY` ausente em produção **passa com aviso** (em vez de falhar quando há outras variáveis do Stripe).

## Adendo 2 — Stripe e VAPID no boot (2026-09-19)

Aplica a proposta da varredura. Novos módulos, chamados só em `buildApp()` depois de `assertR2ForBoot()`:

**Stripe — `common/stripe-config.ts` (`assertStripeForBoot`)**
1. **Produção com `STRIPE_SECRET_KEY` definida** (billing real ligado): `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL` e
   `STRIPE_CANCEL_URL` são obrigatórias; faltando qualquer uma o boot **lança** (`[billing] Stripe inválido em produção: …`, saída 1).
   Todos os problemas aparecem juntos numa só mensagem.
2. As duas URLs, em produção, precisam ser **https**, **não** apontar para localhost (`localhost`, `*.localhost`, `127.x`, `0.0.0.0`,
   `::1`) e não ter espaço/quebra de linha. Não se confere o domínio (nem se faz rede): só se barra o que com certeza é erro.
3. **Produção sem `STRIPE_SECRET_KEY`:** passa, com aviso `[billing] … billing DESLIGADO` 1x por processo. Se o segredo do webhook
   ou as URLs estiverem definidos, o aviso diz (só nomes) que serão IGNORADOS — provavelmente a chave sumiu. Não falha: billing
   desligado é escolha válida.
4. **Fora de produção nada falha.** Só avisa (1x por processo) quando há `STRIPE_SECRET_KEY` sem `STRIPE_WEBHOOK_SECRET` (pagamento
   não seria creditado). As URLs **não** são conferidas: o padrão `localhost:3000` é o correto em dev.

"Definida": a chave, como em `resolvePaymentProvider` (não vazia — o boot vale exatamente quando o provider Stripe é criado; uma
chave só com espaço conta como ativa); as demais, não vazias após `trim()` (segredo só com espaço equivale a ausente).

**VAPID — `common/vapid-config.ts` (`assertVapidForBoot`)**
5. **Só UMA das duas chaves** (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`) definida: em produção o boot **lança** (`[push] VAPID inválido
   em produção: … definida, FALTA …`); fora de produção só avisa. As duas ou nenhuma passam em silêncio (push desligado é opcional).

**Comum:** mensagens só com NOMES de variável, nunca valores (segredo do webhook, chave do Stripe, URLs, chave privada).

**Scripts de linha de comando:** nada muda para o `push-cron` (só `DATABASE_URL` + `VAPID_*`). Os dois módulos novos e
`billing/payment.provider.ts` entraram na lista `FORBIDDEN` de `test/cli-boot-isolation.spec.ts`: se um script passar a alcançá-los
(direta ou transitivamente), o teste falha. O `push:dispatch` continua com a própria checagem de VAPID pela metade.

**Testes:** `test/stripe-config.spec.ts` (combinações em produção, cada uma das três faltando individualmente, URLs http/localhost/
inválidas, sem chave, fora de produção, ausência de valores nas mensagens, `buildApp()` real) e `test/vapid-config.spec.ts`.
`auth-secret.spec.ts`, `database-url.spec.ts` e `r2-config.spec.ts` passaram a isolar `STRIPE_*` e `VAPID_*`.

**Consequências / riscos**
- Um deploy de produção com Stripe ligado e qualquer uma das três variáveis ausente/ruim, ou com VAPID pela metade, **deixa de subir**
  — deliberado. **Ação antes do merge:** conferir no Railway (serviço da API) `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL` e
  `STRIPE_CANCEL_URL` (https, domínio real) e as duas chaves VAPID (ou nenhuma). O `push-cron` não é afetado.
- Continua sem detecção: segredo do webhook de OUTRO endpoint/modo (test × live), URL https do domínio errado, e
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` da web diferente da pública da API. Conferir na operação (evento de teste do Stripe; checklist do DEPLOY.md).
- Uma chave do Stripe em modo de teste (`sk_test_…`) em produção também passa — a checagem não olha o prefixo (fora do escopo pedido).

**Alternativas consideradas**
- *Falhar também sem a chave quando houver outras variáveis do Stripe:* rejeitada por decisão do dono — só avisa.
- *Exigir o prefixo `whsec_`/`sk_live_`:* rejeitada por ora — risco de derrubar um deploy que funciona (formatos mudam; modo de teste).
- *Validar o domínio das URLs contra `genbreed.com.br`:* rejeitada — domínio custom/staging legítimos; só se barra localhost e http.
- *Reaproveitar `vapidPartiallyConfigured()` dentro de `common/vapid.ts`:* rejeitada — colocaria a guarda no grafo do cron; a guarda
  ficou em módulo próprio (`vapid-config.ts`) e `vapid.ts` segue puro.

## Alternativas consideradas

- **Só avisar no log em produção:** rejeitada — é o estado atual disfarçado; ninguém lê o log antes de perder as imagens.
- **Sempre exigir as cinco em produção, com ou sem `FAL_KEY`:** rejeitada — obrigaria credenciais R2 num ambiente
  procedural que não grava nada.
- **Validar formato/alcançar o bucket no boot (HEAD/PUT de teste):** rejeitada por ora — rede no boot, risco de derrubar
  o deploy por instabilidade do Cloudflare; a checagem de presença cobre o erro real (variável faltando).
- **Lançar em runtime na primeira gravação:** rejeitada — o nascimento já teria gasto a vaga e o custo do fal.ai.
