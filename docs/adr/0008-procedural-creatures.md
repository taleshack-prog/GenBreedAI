# ADR-0008 — Renderização procedural de criaturas + estética Cyber-Genetics

- **Status:** aceito
- **Data:** 2026-09-06

## Contexto

O passo 3 inicial entregou um Laboratório funcional porém **sem animais** e fora
da identidade visual: eu não apliquei o `docs/Design_System.md` (estética
Cyber-Genetics: fundo #050A0F, neon ciano #00F0FF = progenitor A, púrpura
#BF00FF = B, Orbitron, cápsulas criogênicas, hélice de DNA). Sem os bichos, "é um
jogo sem jogo".

## Decisão

1. **Aplicar o Design System à risca**: paleta com hex exatos, Orbitron/Inter/
   JetBrains Mono, cápsulas criogênicas (líquido pulsante + partículas de DNA),
   hélice de DNA girando, bordas neon, status por F (amarelo >0.15, vermelho >0.20).
2. **Renderizador procedural de criaturas** (`lib/appearance.ts` + `components/
   Creature.tsx`): a aparência (base, padrão, pontos tan, piebald, olhos) é
   derivada do GENÓTIPO — melanismo, brindle (K^br), merle (M), harlequin (H+M),
   diluição (c^ch), liver (b/b), fulvo (A^y), tan-points (a^t), piebald (s^p).
   Padrões posicionados por PRNG semeado pela cacheKey → estáveis e determinísticos.
   É o pilar "renderização procedural instantânea" do TDD/PRD (tier grátis).
3. **Fotorrealismo fica para o pipeline de IA** (fase posterior; DS §3.1 pede PNG
   fotorrealista). O procedural é a prévia instantânea; o retrato IA é o upgrade
   premium, cacheado por `cacheKey` (que o motor já gera).

## Consequências

- Cada espécime (pais e prole) tem um retrato visível e gene-accurate.
- Verificado por rasterização: felino melanístico/fulvo, brindle, merle,
  harlequin e creme renderizam com a genética legível.
- Estética alinhada ao brief; nenhum valor de cor inventado.

## Alternativas consideradas

- **Esperar o pipeline de IA para ter imagens:** rejeitada — deixaria o jogo sem
  rosto por muitas fases; o procedural é justamente o caminho instantâneo do TDD.
- **Fotos reais/stock de animais:** rejeitada — direitos autorais e quebra da
  estética de estúdio uniforme.
