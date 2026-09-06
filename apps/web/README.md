# apps/web — Laboratório (Next.js 15 PWA) — FASE 3

Tela onde o jogador seleciona sire/dam, vê a **prévia da prole** (distribuição de
Punnett + F de Wright + alertas letais, calculada no cliente pelo motor) e
**confirma o cruzamento** na API, revelando o card do espécime (fenótipo,
genótipo, aura, métricas). Ver ADR-0007.

## Rodar (precisa da API no ar)

O jeito mais simples é subir tudo pela raiz do monorepo:
```bash
pnpm dev     # sobe API (:3001) e web (:3000) juntas (Turborepo)
```
Depois abra http://localhost:3000. O web faz proxy de `/api/*` para a API (:3001),
então não há CORS. A API usa a Neon se `apps/api/.env` tiver `DATABASE_URL`; o web
não precisa de banco.

Só o web:
```bash
pnpm --filter @genbreedai/web dev     # :3000 (requer a API rodando em :3001)
```

## Design

Tema escuro/científico (tons frios): dados/loci em teal, QTLs em violeta, auras
em ouro (único acento quente). Tipografia: Space Grotesk (display) + Inter (texto)
+ JetBrains Mono (alelos/genótipo). Ver `tailwind.config.ts`.

## Próximo

Service worker PWA (next-pwa) para offline real; sessão Auth.js no lugar dos
cabeçalhos de dev; telas de Galeria/Genoma/Linhagem (TDD §navegação).
