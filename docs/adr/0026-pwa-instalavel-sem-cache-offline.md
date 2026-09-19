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
   atualização futura.

## Consequências

- **Ícones PNG pendentes (não foram inventados):** `icon-192.png`,
  `icon-512.png`, `icon-maskable-512.png` (fundo cheio, glifo na zona segura)
  e `apple-touch-icon.png` (180×180, opaco). Origem: `public/icon.svg`. Até
  existirem, o manifest declara só o SVG (`sizes: any`) — o Chrome o aceita —
  e o iPhone monta o ícone da tela inicial a partir de uma captura da página.
  Quando o PNG de 180 existir, descomentar `icons.apple` no `layout.tsx`. O
  teste `pwa-files.test.ts` falha se o manifest apontar para arquivo inexistente.
- Quem já tem sessão nunca vê a landing (`middleware.ts` redireciona `/` →
  `/app`): as instruções alcançam só visitantes deslogados. Um cartão de
  instalação dentro do app (Perfil) fica como passo seguinte.
- O service worker novo é uma peça a mais em produção: uma versão quebrada de
  `sw.js` afeta todos os visitantes que o registraram. Por isso é mínimo e
  coberto por teste (sem `caches`, sem `respondWith`).
- Push (Web Push/VAPID, assinatura, envio) **não** está implementado nem
  decidido aqui; no iOS exige 16.4+ e o app instalado.

## Alternativas consideradas

- **`next-pwa`/Workbox** — rejeitado: dependência nova e cache automático de
  assets/rotas, exatamente o risco de conteúdo velho que se quer evitar.
- **`app/manifest.ts`** — equivalente no Next 15, mas o `public/manifest.webmanifest`
  já existia e é referenciado; ter os dois no mesmo caminho conflita.
- **Cache offline básico do shell** — rejeitado nesta rodada (ver decisão 3).
- **`black-translucent`** — rejeitado enquanto não houver tratamento de safe-area.
