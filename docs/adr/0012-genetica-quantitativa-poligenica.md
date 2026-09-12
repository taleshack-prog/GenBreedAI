# ADR-0012 — Genética quantitativa poligênica + heterozigose de fundadores

**Data:** 2026-09-08 · **Status:** aceito

## Contexto
A F1 de raças puras saía com fenótipo único. Diagnóstico: (a) fundadores
homozigotos → F1 discreta uniforme (1ª Lei de Mendel — cientificamente CORRETO);
(b) QTL herdado como média-exata dos pais (irreal — irmãos não variam).

## Decisão
1. **QTL poligênico com variância de segregação** (ADR-0012): o filho recebe a
   média parental + desvio gaussiano determinístico; σ = 0.12·√h². h² por traço
   (porte 0.55, vigor 0.5, beleza/temperamento 0.4). Reproduz "irmãos variam em
   torno da média" e permite melhoramento real (R = h²·S). Determinístico sob seed.
2. **Heterozigose de fundadores (portadores ocultos)**: fundadores carregam
   recessivos ocultos em loci NÃO-identitários (cor/modificadores), para a F1
   revelar variação discreta ocasional — sem quebrar a identidade da raça (loci
   que definem a raça permanecem fixos/homozigotos).

## Nuance científica (honestidade)
Em cruzas de puros, a F1 discreta uniforme é BIOLOGICAMENTE correta. A variação
real entre irmãos de F1 é sobretudo QUANTITATIVA (tamanho/forma) — resolvida pela
Parte 1. A heterozigose (Parte 2) adiciona surpresas discretas realistas
(portadores), mas com moderação para não descaracterizar raças.

## Impacto no gate
Golden arcs usam qtl:{} → não afetados pela Parte 1. Determinismo preservado.
