# ADR-0034 — B e D destravados em `fel()` e no texto do prompt felino

- **Status:** aceito · **Data:** 2026-09-23
- **Não muda** nenhum genótipo de fundador, o motor, a `cacheKey` nem `CURRENT_ART_VERSION`. É a 1ª etapa do levantamento de cores por raça
  (fundadores novos ficam para depois, com aprovação).

## Contexto

`fel()` (helper local de `founderSeeds()`) fixava `B: B/B` e `D: D/D` em todo gato e felino selvagem: chocolate (`b`), canela (`b^l`) e
diluído (`d`) existem no pack (`feline.ts`), mas nenhum fundador podia carregá-los — bloqueando azul, chocolate, lilás, fawn e a cor dos
pontos do siamês. Além disso o texto do prompt para essas cores era ruim: `a cool grey diluted blue-grey plain uniform coat`, marcas
sempre "black", melanismo (`A_`) ignorando B e D, e pontos (`c^s/c^s`) sem cor ("darker pointed extremities").

## Decisão

1. **`fel()` aceita `B` e `D`** como parâmetros no FIM da lista, com padrão `["B","B"]` e `["D","D"]`. As 25 chamadas atuais são posicionais
   e não mudam; nenhum fundador muda de genótipo (teste confere B/B e D/D nos 54 fundadores felinos).
2. **Texto de pelagem** (`coatFeline`, `apps/api/src/images/prompt.ts`), para `a/a` de padrão liso:
   `a solid blue-grey (diluted black) coat` (d/d) · `a solid chocolate brown coat` (b/b) · `a solid lilac (diluted chocolate) coat` (b/b d/d) ·
   `a solid cinnamon coat` (b^l/b^l) · `a solid fawn coat` (b^l/b^l d/d). Padrão marcado: `a <cor> coat with bold vertical darker stripes` /
   `…round solid darker spots` / `…covered in bold darker rosettes with inner spots` (marcas "darker", não "black").
3. **Melanismo (`A_`)** passa a respeitar B/D quando fora do preto denso: `a melanistic solid blue-grey (diluted black) coat with faint ghost
   markings` — preto + diluição é o azul. Preto denso segue igual. (Extensão além do pedido, mesma regra; reversível.)
4. **Pontos** (`c^s/c^s`): a cor vem de B e D — seal (B_ D_), chocolate, blue, lilac (+ cinnamon/fawn com `b^l`) — em
   `, with <cor> pointed extremities (face, ears, paws)` (`chocolate-brown`, `blue-grey`, `pale lilac-grey`). O CORPO do gato de pontos
   continua no tom de fundo (`Bd`), sem a cor de B/D. **`seal` mantém a frase antiga ("darker pointed extremities")** para os três fundadores de
   pontos atuais (Siamês, Birmanês, Ragdoll) e o tigre-branco não mudarem de prompt — o nome "seal" existe em `felinePointColour()` e nos testes, mas
   o texto do seal não é reescrito. Escrever "seal-brown" alteraria o prompt dos fundadores (não as imagens já gravadas).
5. **Portador (`B/b`, `D/d`) não muda a cor** — texto padrão, como deve ser.

## Consequências

- **`cacheKey`: nenhuma mudança.** Genótipos idênticos → `hashGenotype`/`computeCacheKey` idênticos; o prompt não entra na chave. Nenhum retrato é
  invalidado nem precisa ser regenerado.
- **Prompt dos fundadores atuais: idêntico**, provado no teste por comparação contra uma cópia literal da `coatFeline` antiga, em todos os 54
  fundadores felinos.
- Um fundador futuro só pode carregar `b`/`b^l`/`d` passando os parâmetros novos de `fel()`; criar fundador ou dar portadores aos atuais é decisão à
  parte (ADR próprio).
- **Limites que permanecem:** O (laranja, creme, tartaruga) e S (bicolor, luvas) continuam sem efeito no prompt; sépia (`c^b`) idem; Sphynx ignora a
  cor (pelado retorna cedo); "silver/smoke" e "mink" não existem no pack; ainda não há alelo de tabby clássico.

## Alternativas consideradas

- *Reescrever também o texto do seal:* rejeitada — mudaria o prompt dos fundadores atuais, contra o pedido.
- *Deixar `A_` ignorando B/D:* rejeitada — um preto diluído (azul) sairia preto assim que existisse um fundador `d/d` melanístico.
- *Adicionar B/D no meio da lista de parâmetros:* rejeitada — quebraria as 25 chamadas posicionais.
