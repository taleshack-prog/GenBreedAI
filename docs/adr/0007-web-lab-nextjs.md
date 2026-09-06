# ADR-0007 — Web (Fase 3): Laboratório Next.js 15 + prévia no cliente

- **Status:** aceito
- **Data:** 2026-09-05

## Contexto

Passo 3 do plano: dar rosto ao produto com o Laboratório (selecionar pais,
prever herança, confirmar cruzamento, inspecionar a prole). O TDD pede Next.js
(App Router) + Tailwind + PWA e "prévia offline determinística".

## Decisão

1. **Next.js 15 (App Router) + Tailwind**, tema escuro/científico (paleta fria;
   único acento quente = auras em ouro).
2. **Prévia no CLIENTE pelo próprio motor** (`@genbreedai/engine`): distribuição
   de Punnett por loco, F de Wright (pedigree montado dos espécimes carregados) e
   alertas de letalidade — tudo determinístico, sem chamar a API. Atende a
   "prévia offline" do TDD e reusa o motor auditado (uma só fonte de verdade).
3. **Confirmação pela API**: `POST /api/v1/cross` (com seed e persistência). A
   prova genética real fica no back-end; a prévia é fiel porque usa o mesmo motor.
4. **Proxy same-origin** via `next.config` rewrites (`/api/* → :3001`) — sem CORS.
5. **Tipografia em runtime** (link Google Fonts) em vez de `next/font` — evita
   fetch em build (ambiente/CI sem acesso a fonts.googleapis.com).
6. **PWA nível manifest** (manifest.webmanifest + theme-color + ícone) nesta
   entrega; o service worker (next-pwa) fica como próximo passo para não arriscar
   a estabilidade do build agora.

## Consequências

- `next build` verde; rota `/` prerenderizada; typecheck estrito limpo.
- Web e API rodam juntos com `pnpm dev` (Turborepo). Web não precisa de DB.
- Reuso total do motor no cliente evita divergência prévia-vs-resultado.

## Alternativas consideradas

- **Prévia via chamada à API:** rejeitada — perde o offline e adiciona latência
  para algo que o motor calcula localmente.
- **CORS em vez de proxy:** rejeitada — rewrites são mais simples e sem preflight.
- **next/font:** rejeitada por ora — quebra build sem rede para o Google Fonts.
