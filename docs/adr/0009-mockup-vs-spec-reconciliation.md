# ADR-0009 — Reconciliação entre os mockups de alta fidelidade e a spec escrita

- **Status:** proposto (aguarda decisão do product owner)
- **Data:** 2026-09-06

## Contexto

O usuário forneceu mockups de alta fidelidade (telas Genetic Lab, Gene Bank,
Híbrido Revelado) que divergem dos documentos escritos tratados como "fonte única
de verdade" (TDD/Gene-Bank/CLAUDE.md):

| Aspecto | Spec escrita | Mockups |
|---|---|---|
| Espécies | caninos + felinos (Panthera) | dinossauros (T-Rex, Raptor), lobo, tigre, águia, crocodilo, touro |
| Genótipo | loci B/K/A/E/S/M/H + QTLs | stats STR/SPD/DEF/RES/COL/PAT (A/B) |
| Moedas | não há | BIOMASSA + CATALISADORES |
| Arte | procedural + IA (fases) | fotorrealista (pipeline de IA) |

## Decisão (provisória)

1. **Seguir o layout e a estética dos mockups à risca** (Cyber-Genetics), pois é
   a instrução mais recente do usuário e prevalece sobre a regra escrita anterior.
2. **Preservar o motor auditado** (loci/QTLs reais) alimentando as telas —
   Punnett, F de Wright e híbridos usam probabilidades reais; nada é fabricado.
   As moedas são chrome de UI (valores demo), não dado genético.
3. **Criaturas procedurais como placeholder** onde a arte IA fotorrealista
   entrará (pipeline de imagens, fase posterior); é o pilar "render procedural
   instantâneo" do TDD.

## Decisões pendentes (product owner)

- **Espécies:** manter caninos/felinos do Gene-Bank OU expandir para as dos
  mockups? Expandir exige novos data packs auditados (não inventar loci).
- **Modelo genético:** manter loci B/K/M/H (auditado) OU migrar para STR/SPD/DEF/
  RES/COL/PAT? Migrar **invalida a auditoria da Fase 0** e exige novo gate.
- **Moedas:** formalizar BIOMASSA/CATALISADORES no modelo de dados (TDD §3)?

Até a decisão, as telas usam o modelo auditado; a troca é localizada (data packs
+ nomes de exibição), não reescrita do motor.
