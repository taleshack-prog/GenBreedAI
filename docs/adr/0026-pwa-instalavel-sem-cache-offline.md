# ADR-0026 — PWA instalável, com service worker mínimo e SEM cache offline

- **Status:** aceito · **Data:** 2026-09-18

## Contexto

Notificação (push) é o próximo passo do produto (avisar quando o filhote
nascer). No iPhone, notificação web só funciona com o site **instalado na tela
inicial**, e só pelo Safari. Instalar, portanto, é pré-requisito do push. Antes
desta decisão o projeto tinha `manifest.webmanifest` e um ícone SVG, mas
nenhum service worker, nenhum `apple-touch-icon` e nenhuma instrução para o
jogador (CLAUDE.md: "não há service worker nem `next-pwa`").

## Decisão

1. **Manifest** em `apps/web/public/manifest.webmanifest` (arquivo estático, o
   que o layout já referenciava): nome "GenBreedAI", curto "GenBreed",
   `start_url: /app`, `display: standalone`, `orientation: portrait`, cores de
   tema e de fundo `#070b11` (= fundo do `body` em `globals.css`).
2. **Service worker mínimo** em `public/sw.js`, sem dependência nova
   (**sem `next-pwa`**), registrado só no cliente e só em produção
   (`ServiceWorkerRegister`). Só existe para permitir a instalação: `fetch`
   trivial que **não** chama `respondWith` (o navegador segue a rede normal).
3. **Sem cache offline.** Cache mal feito serve conteúdo velho (telas do jogo,
   respostas da API, preços) e é pior que nenhum. Qualquer cache futuro exige
   ADR próprio, com estratégia por rota e versionamento.
4. **Barra de status do iPhone `black` (opaca)**, não `black-translucent`: o
   app não trata `safe-area`, e a translúcida faz o conteúdo passar por baixo
   da barra no app instalado.
5. **Landing:** seção "Instale o app" com as instruções reais (Android/Chrome:
   menu ⋮ → "Instalar app"; botão "Instalar" quando o navegador oferece
   `beforeinstallprompt`; iPhone/Safari: Compartilhar → "Adicionar à Tela de
   Início", deixando claro que só o Safari serve). O aparelho detectado vem
   primeiro (`lib/install-guide.ts`), a outra instrução nunca é escondida. O
   texto **não promete** notificação já ativa: diz que os avisos chegam em
   atualização futura. *(Superado em 2026-09-19: o Web Push subiu — ADR-0028 —
   e o texto passou a dizer que o aviso de gestação concluída já funciona; ver
   Consequências.)*

## Consequências

- **Ícones (atualização de 2026-09-19):** a arte oficial (cromossomo com bandas e
  anel de escala, fundo opaco `#070b11`) foi gerada em PNG e está em `public/`:
  `icon-192.png` (192×192), `icon-512.png` (512×512), `icon-maskable-512.png`
  (512×512, fundo cheio, desenho nos ~80% centrais) e `apple-touch-icon.png`
  (180×180, opaco). O manifest declara os três primeiros (`purpose: any`, `any`,
  `maskable`); o layout aponta `icons.apple` para o de 180 e os ícones de aba para
  os de 192/512. **O `icon.svg` deixou de ser referenciado** (é um desenho anterior,
  não a arte oficial): manifest e PNG não podem apontar para artes diferentes.
  O arquivo continua em `public/` como órfão — apagar ou atualizar para a arte nova
  é decisão do dono. `pwa-files.test.ts` confere que o tamanho declarado é o real
  (cabeçalho do PNG), que são opacos e que nada aponta para o `icon.svg`.
  `icon-512.png` e `icon-maskable-512.png` são **byte a byte idênticos** — aceitável:
  a arte já cabe na zona segura do maskable (o anel de escala tem ~77% da largura,
  dentro do círculo de 80%) e o fundo já é cheio até a borda.
- **Lacunas opcionais de ícone/abertura (não bloqueiam a instalação):** telas de
  abertura do iOS (`apple-touch-startup-image`, uma por tamanho de aparelho — sem
  elas o iPhone pode mostrar um instante de tela branca ao abrir o app instalado),
  ícone monocromático para os ícones temáticos do Android 13+, `favicon.ico` de
  32/48 px e ícones do iPad (152/167 — o iOS reduz o de 180).
- Quem já tem sessão nunca vê a landing (`middleware.ts` redireciona `/` →
  `/app`): as instruções da landing alcançam só visitantes deslogados.
  **Resolvido (2026-09-19):** o Perfil ganhou o cartão "Instale o app" — o MESMO
  componente `InstallApp` com `variant="compact"`: versão curta, só do sistema
  detectado (Android → Android; iPhone → iPhone; desktop → nada, salvo se o
  navegador oferecer o convite nativo), com a âncora `#instalar-app`; some quando o
  app já roda instalado. O botão "Avisar quando nascer" (ADR-0028) aponta para ele
  no iPhone sem o app instalado, sem repetir os passos (`installCardHref`).
  **Pendência do texto `INSTALL_WHY` — resolvida (2026-09-19):** o Web Push está em
  produção (cron `push-cron` a cada 5 minutos; aviso "Gestação concluída" confirmado
  em aparelho Android) e o texto da landing foi atualizado: o aviso já funciona; no
  Android e no computador chega pelo navegador; no iPhone só com o app instalado na
  tela inicial e iOS 16.4+. Um teste (`pwa-files.test.ts`) varre o código da web e
  falha se algum texto voltar a tratar aviso/notificação/push como futuro.
- O service worker novo é uma peça a mais em produção: uma versão quebrada de
  `sw.js` afeta todos os visitantes que o registraram. Por isso é mínimo e
  coberto por teste (sem `caches`, sem `respondWith`).
- Push (Web Push/VAPID, assinatura, envio) **não** é decidido aqui — é o
  ADR-0028 (em produção). No iOS exige 16.4+ e o app instalado.

## Alternativas consideradas

- **`next-pwa`/Workbox** — rejeitado: dependência nova e cache automático de
  assets/rotas, exatamente o risco de conteúdo velho que se quer evitar.
- **`app/manifest.ts`** — equivalente no Next 15, mas o `public/manifest.webmanifest`
  já existia e é referenciado; ter os dois no mesmo caminho conflita.
- **Cache offline básico do shell** — rejeitado nesta rodada (ver decisão 3).
- **`black-translucent`** — rejeitado enquanto não houver tratamento de safe-area.
