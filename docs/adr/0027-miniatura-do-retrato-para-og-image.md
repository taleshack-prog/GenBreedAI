# ADR-0027 — Miniatura do retrato (600×600 JPEG) para a og:image do WhatsApp

- **Status:** aceito · **Data:** 2026-09-19

## Contexto

A prévia do link `/f/[id]` no WhatsApp parou de mostrar imagem. A `og:image`
apontava para o retrato original (PNG 1024×1024, hoje ~1,2 MB) e o WhatsApp
ignora imagens grandes ao montar o card (limite prático ~300 KB). Os primeiros
compartilhamentos funcionaram porque os retratos eram menores. A Cloudflare do
domínio está no plano gratuito, sem transformação de imagem por URL — a
miniatura precisa existir como objeto próprio.

## Decisão

1. **Ao gravar um retrato** (`storage.store`, único ponto de gravação, chamado
   de `image.service`), gera-se também uma miniatura: **600×600, JPEG q80**
   (`fit: cover`, transparência achatada sobre o fundo do app), alvo **< 200 KB**
   — se q80 passar, tenta 70/60/50 e fica com a primeira que couber (ou a menor,
   com aviso). Salva ao lado do original com sufixo previsível:
   `generated/<cacheKey>_thumb.jpg`. Lib: `sharp` (dependência **a instalar**, ver
   Consequências), carregada por `import()` dinâmico.
2. **Melhor-esforço, nunca bloqueante:** falha ao gerar ou gravar a miniatura
   (sharp ausente, imagem ilegível, R2 recusando) vira `console.warn` e o
   fluxo segue — o original é gravado ANTES e nada o desfaz. Se a miniatura
   falhar numa regravação do mesmo `cacheKey`, a miniatura antiga é removida
   (não fica servindo a imagem errada).
3. **`storage`:** `thumbUrl(cacheKey, version?)` (mesmo padrão de `publicUrl`,
   com `?v=`), `statThumb`, `storeThumbnail`; `remove()` apaga original **e**
   miniatura (regeneração não deixa miniatura velha).
4. **API:** `GET /public/specimens/:id` devolve também `thumbUrl` (string ou
   `null`); `null` quando a miniatura não existe. Continua uma projeção pública
   estrita (só ganhou esse campo).
5. **Web:** `/f/[id]` usa a miniatura em `og:image` (600×600, `image/jpeg`) e
   `twitter:image`; sem miniatura, cai no original (1024×1024 `image/png`, como
   antes); sem retrato, no fallback genérico. A imagem EXIBIDA na página segue
   sendo a original. Decisão em função pura (`pickOgImage`, `lib/share.ts`).
6. **Retratos anteriores** não têm miniatura. Script de administração
   `images:backfill-thumbs`: dry-run por padrão (conta quantos faltam), `--apply`
   exige `--confirm-bucket`, `--max` opcional, idempotente. Só lê o PNG do
   storage e grava `_thumb.jpg` — **sem fal.ai, sem imagem nova, sem tocar no
   original**.

## Consequências

- **`sharp` ainda não está em `apps/api/package.json`** (o `sharp` que existe no
  `node_modules` é dependência opcional do Next, do lado da web, invisível para a
  API). Instalar: `pnpm --filter @genbreedai/api add sharp`, commitando
  `package.json` e `pnpm-lock.yaml` **juntos** — o Dockerfile roda `pnpm install
  --frozen-lockfile`; um `package.json` alterado sem o lockfile derruba o build.
  Até lá tudo degrada com segurança (retrato salvo, aviso no log, prévia usa o
  original).
- Um objeto a mais por retrato no R2 (~100–200 KB) e uma leitura de HEAD a mais
  em `GET /public/specimens/:id`.
- Mesmo bucket e mesmas credenciais: não exige configuração nova do R2, salvo se o
  token for restrito por prefixo/tipo (não verificável pelo código). O backfill
  usa List/Get/Put.
- O WhatsApp guarda a prévia de um link em cache: links já vistos podem levar um
  tempo para refletir a miniatura.
- Testes que dependem do `sharp` real (tamanho/dimensões) só rodam com ele
  instalado (`describe.skipIf`); a lógica de tamanho, a gravação e a tolerância a
  falhas são cobertas com um codificador falso e rodam sempre.

## Alternativas consideradas

- **Transformação de imagem por URL (Cloudflare Images / Polish / resizing)** —
  inviável: plano gratuito, sem transformação por URL.
- **Redimensionar na web (Next Image) ao servir a og:image** — rejeitada: a
  og:image é lida por robôs de prévia, o `next/image` otimizado por URL também é
  custo/limite do Vercel e não resolve o objeto grande no R2.
- **Gerar a miniatura sob demanda na rota pública** — rejeitada: escreveria no
  storage a partir de uma rota sem login (a rota pública é leitura pura por
  desenho) e atrasaria a primeira prévia.
- **Reduzir o PNG original** — rejeitada: perde qualidade do retrato exibido no
  jogo e na página; o problema é só da prévia.
- **Miniatura obrigatória (falhar o retrato se ela falhar)** — rejeitada: o
  retrato é o que o jogador pagou (vaga/crédito); a miniatura é acessório.
