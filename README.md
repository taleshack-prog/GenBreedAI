# GenBreedAI

Game de **genética aplicada** a animais (PWA mobile + web PC) — Hack Tech Farm.
O jogador cruza espécies, estuda herança mendeliana e quantitativa **real** e
tenta fixar fenótipos ao longo de gerações. Monorepo Turborepo + pnpm.

> **Status: FASE 0 APROVADA · FASE 1a (API) + 1b (persistência) prontas.**
> Motor: golden **22/22** · engine **44/44**. API: **15/15** (unit + e2e + Drizzle/Postgres).
> Total workspace: **59 testes verdes**, typecheck estrito 0 erros.
> Parecer da Fase 0: [`docs/audit/fase0-audit.md`](docs/audit/fase0-audit.md) ·
> Errata: [`docs/errata/fase0-errata.md`](docs/errata/fase0-errata.md).

## Estrutura

```
genbreedai/
├── apps/
│   ├── web/       # Next.js 15 PWA — FASE 1 (scaffold; próximo)
│   └── api/       # ✅ NestJS + Fastify — POST /api/v1/cross + Drizzle/Postgres (Fase 1a/1b)
├── packages/
│   ├── engine/    # ✅ Motor genético determinístico (TypeScript puro, sem I/O)
│   └── shared/    # ✅ Tipos, DTOs e constantes
├── docs/          # TDD, PRD, Gene-Bank, specialists, adr/, audit/
└── CLAUDE.md
```

## O motor (`packages/engine`)

TypeScript puro, determinístico sob seed, sem I/O, sem dependências externas —
roda no servidor e em workers de browser (prévia offline). API principal:

| Função | Papel (TDD §4.4 / §7.4) |
|---|---|
| `createPrng(seed)` | PRNG determinístico (xmur3 + mulberry32) |
| `generateGamete` / `combineGametes` | Meiose + fusão do zigoto (µ=1e-4) |
| `expressPhenotype` | Dominância, epistasia (Harlequin×Merle), letais (M/M) |
| `punnett*` | Distribuições exatas (3:1, m/m 25%, recombinantes) |
| `wrightF` / `kinship` | Coeficiente de endogamia de Wright (coancestria) |
| `fertilityScore` | Haldane, depressão endogâmica, outcross de resgate |
| `fixationIndex` / `mapFixationToAura` | IF de jogo → auras 1–5 |
| `cross` | Orquestra tudo; **tier-agnóstico** (anti-P2W) |

### Garantias travadas por teste
- **Determinismo:** mesma seed + parentais → resultado idêntico.
- **Anti-P2W:** `cross()` não recebe tier; resultado idêntico nos 4 tiers.
- **Separação `F_pedigree` (biologia) × `IF` (jogo)** — TDD §4.3.

## Comandos

```bash
pnpm install          # instala o workspace
pnpm test             # todos os testes (unit + golden)
pnpm test:golden      # apenas os 4 arcos-ouro
pnpm typecheck        # TypeScript estrito
pnpm lint             # ESLint
pnpm dev              # sobe web + api (Fase 1)
```

## Correções aplicadas na Fase 0 (ver `docs/adr/`)

A recalculação científica independente encontrou 3 inconsistências nos
documentos-fonte, corrigidas no motor e registradas em ADR:

1. **ADR-0002:** `F` narrativo do Gene-Bank (F2=0.10, BC1=0.03) ≠ F de Wright
   real (0.25). O motor usa Wright real (confirmado pelo TDD §4.5).
2. **ADR-0001:** "cacheado `F/F`" na F1 do Goldendoodle é impossível
   (f/f×F/F ⇒ 100% ondulado). F1 varia por cor, não textura.
3. **ADR-0004:** "IF ≈ 0.03" na BC1 contradiz a fórmula do TDD (com F=0.25,
   IF ≥ 0.30). Motor usa a fórmula; "0.03" marcado para errata.

Detalhes e severidade (GRADE) no parecer de auditoria.
