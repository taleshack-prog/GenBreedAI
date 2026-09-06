# Auditoria Científica — Fase 0 v2 (Modelo STR/SPD/DEF/RES/COL/PAT)

**Base:** ADR-0009 (migração de modelo aceita). **Data:** 2026-09-06

## Escopo
Migração do modelo genético para 6 loci uniformes. O NÚCLEO do motor (PRNG,
gameta, Punnett, F de Wright, fertilidade/Haldane, IF/auras, mutação, SHA-256) é
o MESMO já auditado na Fase 0 v1 — opera sobre loci abstratos, sem mudança. O que
foi revalidado são os data packs (GENE_MODEL) e as novas invariantes.

## Modelo
- STR, SPD, DEF, RES: dominância incompleta; valor aditivo A/A=1.0, A/B=0.5, B/B=0.0.
- COL: dominância incompleta (escuro/médio/claro).
- PAT: dominância completa (padronizado × sólido).
- Sem letais por padrão; espécies compartilham os loci, diferem na arte/genótipos.

## Recálculo independente (golden tests, tolerância zero)
| Invariante | Esperado | Motor |
|---|---|---|
| PAT (A/B × A/B) | 3:1 (0.75 : 0.25) | ✅ |
| COL (A/B × A/B) | 1:2:1 (0.25/0.5/0.25) | ✅ |
| deriveStats | A/A=1, A/B=0.5, B/B=0 | ✅ |
| F Wright irmãos completos | 0.25 | ✅ |
| F Wright retrocruzamento | 0.25 | ✅ |
| F Wright não aparentados | 0 | ✅ |
| F1 interespecífico | Haldane (fertilidade 0) | ✅ |
| Determinismo / Anti-P2W | idêntico por seed/tier | ✅ |

**Execução:** engine **27 testes** verdes (golden + unit + paridade); API **15**
verdes (incl. Postgres real via PGlite); typecheck estrito 0 erros; web build OK.

## Status
**APROVADO (v2).** O modelo migrado preserva o rigor mendeliano e o núcleo
auditado; as novas invariantes passam com tolerância zero. Persistência
(Drizzle/Neon) e paridade anti-P2W mantidas.
