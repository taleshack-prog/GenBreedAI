# ADR-0037 — Listas de espécimes usam a miniatura do retrato

- **Status:** aceito · **Data:** 2026-09-24
- **Usa** a miniatura da ADR-0027 (600×600 JPEG, ~28 KB, `generated/<cacheKey>_thumb.jpg`), até aqui só consumida por `/public/specimens/:id` (prévia do WhatsApp).

## Contexto

Com ~90 fundadores, a galeria de espécies e o Gene Bank ficaram lentos: cada card carregava o retrato ORIGINAL (PNG 1024×1024, > 1 MB), dezenas de MB de uma vez, com imagens
aparecendo aos poucos. As miniaturas já existiam (uma por retrato) e nenhuma tela de lista as usava. Além disso, a rota `GET /api/v1/specimens` NÃO devolve imagem: cada card
faz uma chamada `GET /specimens/:id/image` (`getImage`) para descobrir a URL.

## Decisão

1. **A API expõe a URL da miniatura onde a web já pega a do original** (campos ADITIVOS; `imageUrl` não muda):
   `ImageResult.thumbUrl?: string | null` (`GET/POST /specimens/:id/image`) e `IncubatorEntryView.thumbUrl: string | null` (`GET /incubator`).
   `thumbUrlIfExists(cacheKey)` (storage) devolve a URL com `?v=` ou `null` — miniatura ausente (retrato anterior à ADR-0027 ou geração falhou) ⇒ `null`.
   A rota pública `/public/specimens/:id` já expunha `thumbUrl`.
2. **Web (`lib/list-image.ts`, puro):** `pickListImage(original, thumb, preferThumb)` — lista com miniatura → miniatura (original vira `fallback`); sem miniatura → original;
   tela individual (`preferThumb=false`) → sempre o original; nada → `null`. `swapToFallback` troca UMA vez para o original se a miniatura falhar ao carregar (sem laço).
3. **Telas:** `CapsuleCard` ganhou `preferThumb`; **galeria de espécies** e **Gene Bank** o ligam; a **incubadora** usa `pickListImage` nas entradas nascidas. Nas listas as
   `<img>` levam `loading="lazy"` e `decoding="async"`. **Continuam com o original:** tela de revelação (`/app/reveal/[id]`, individual) e as duas cartas de progenitores do
   Laboratório (não são lista).
4. Regenerar o retrato num card de lista limpa a miniatura antiga e mostra o original novo até recarregar.

## Consequências

- **Redução:** os retratos únicos exibidos são ~32 (Free: só gatos), ~48 (Junior: felinos) e ~95 (Senior/PhD: tudo) — gêmeos compartilham a mesma URL (o navegador baixa uma vez).
  Com o PNG em ≥ 1 MB isso é **≥ 32 / 48 / 95 MB** hoje; com miniaturas de ~28 KB, **~0,9 / 1,3 / 2,7 MB** (≈ 97% a menos). Números são estimativas (não medidos no repo); o Gene Bank
  soma os espécimes do jogador.
- **Custo no servidor:** cada `getImage` agora faz um `HEAD` a mais (R2) para a miniatura. Uma galeria com N cards faz N chamadas (já era assim) e N `HEAD`s extras.
- **Não resolvido aqui:** a cascata de N chamadas `getImage` (uma por card, inclusive os gêmeos que repetem a imagem). Próximo passo natural: `GET /specimens` devolver `imageUrl`/`thumbUrl`
  (aditivo, em lote) e/ou a galeria mostrar só um card por par de gêmeos. Fora deste ADR.
- Sem migração de dados nem mudança de `cacheKey`/prompt.

## Alternativas consideradas

- *Derivar a URL da miniatura no cliente pelo sufixo (`_thumb.jpg`):* rejeitada — não sabe se a miniatura existe (retratos antigos) e dependeria de `onError` para tudo.
- *Trocar o original pela miniatura em todas as telas:* rejeitada — a tela individual precisa da resolução cheia.
- *Colocar `thumbUrl` em `GET /specimens`:* adiada — N `HEAD`s na listagem inteira; melhor junto com o lote de `imageUrl`.
