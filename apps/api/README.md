# apps/api — REST /api/v1 (NestJS + Fastify) — FASE 1 (em progresso)

**Implementado (Fase 1a):** endpoint `POST /api/v1/cross` fiado no motor genético,
com autenticação (guard dev), guard de cota por tier (anti-P2W) e persistência
in-memory atrás de uma porta (`SpecimenRepository`). Ver ADR-0005.

## Endpoint

`POST /api/v1/cross` — headers: `x-user-id`, `x-user-tier` (FREE|JUNIOR|SENIOR|PHD).
Body: `{ sireId, damId, method, seed?, targetLoci?, generationsUnderSelection? }`.
Respostas: 201 (espécime + cacheKey), 400 (DTO inválido / packs distintos),
401 (sem auth), 429 (cota diária estourada).

Espécimes-fundadores semeados: `puma`, `negra`, `delta` (felino); `golden`,
`poodle` (canino).

## Rodar

```bash
pnpm --filter @genbreedai/api dev     # http://localhost:3001/api/v1
pnpm --filter @genbreedai/api test    # unit + e2e (11 testes)
```

Exemplo:
```bash
curl -X POST http://localhost:3001/api/v1/cross \
  -H 'content-type: application/json' \
  -H 'x-user-id: u1' -H 'x-user-tier: PHD' \
  -d '{"sireId":"delta","damId":"negra","method":"BC1"}'
```

## Próximo (Fase 1b)

Adapter Drizzle/PostgreSQL (genoma JSONB) para `SpecimenRepository`; `QuotaService`
sobre Redis Token Bucket; Auth.js (JWT); demais endpoints do TDD §8
(`GET /specimens`, `/lineage`, `/species`, `/loci`, gifts, referral). Stack alvo:
TDD §2/§8. Não-escopo (Fase 0–2): mercado fora do PhD, web3, websockets complexos.

## Fase 1b — Persistência Drizzle/PostgreSQL (Neon)

1. Rotacione a senha do Neon e crie `apps/api/.env` a partir de `.env.example`:
   `DATABASE_URL=postgresql://USER:SENHA@ep-...-pooler.REGIÃO.aws.neon.tech/neondb?sslmode=require`
2. Aplique migrations e semeie os fundadores na Neon:
   ```bash
   pnpm --filter @genbreedai/api db:migrate
   pnpm --filter @genbreedai/api db:seed
   ```
3. Suba a API — com `DATABASE_URL` definido, ela usa o Postgres automaticamente
   (sem a variável, cai no in-memory):
   ```bash
   pnpm --filter @genbreedai/api dev
   ```

Migrations versionadas em `apps/api/drizzle/`. Redis/BullMQ (fila de imagens IA)
fica para fase posterior — não é necessário agora.
