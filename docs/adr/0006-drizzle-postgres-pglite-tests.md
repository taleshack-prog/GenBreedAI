# ADR-0006 — Persistência Drizzle/PostgreSQL + testes com PGlite

- **Status:** aceito
- **Data:** 2026-09-05

## Contexto

Fase 1b: persistir espécimes/genoma (TDD §2/§3, genoma em JSONB). O código não
pode depender de um Postgres nativo para os testes rodarem em CI/sandbox, mas
precisamos validar as migrations e as queries contra um Postgres **real**.

## Decisão

1. **Drizzle ORM** com schema em `apps/api/src/db/schema.ts` (users, specimens,
   crosses). Genótipo/fenótipo em `jsonb`.
2. **Produção:** driver `pg` (node-postgres) via `DATABASE_URL` — Neon, Railway
   ou Postgres nativo. SSL ligado automaticamente para `neon.tech`/`sslmode=require`.
3. **Testes:** **PGlite** (Postgres em WASM, in-process) executa as mesmas
   migrations e o mesmo código Drizzle. Prova schema+queries num engine Postgres
   real, sem binário nativo nem rede.
4. **Porta única:** `DrizzleSpecimenRepository` implementa a mesma
   `SpecimenRepository` (assíncrona) do in-memory. A DI escolhe o adapter por
   `DATABASE_URL` (ADR-0005). Serviço/controller inalterados.
5. **`any` pontual:** o campo `db` do `DrizzleSpecimenRepository` é `any` para
   aceitar tanto `NodePgDatabase` quanto o tipo do driver PGlite (genéricos
   divergentes). Uso restrito a esse ponto de fronteira de driver; as queries em
   si são tipadas pelo schema. Este ADR autoriza o `any` (regra CLAUDE.md §5).

## Consequências

- Migrations versionadas em `apps/api/drizzle/*.sql` (aplicáveis à Neon com
  `db:migrate`).
- Testes de banco (4) rodam offline; suíte API total: 15 verdes.
- A porta assíncrona tornou `CrossService.execute` async (refch trivial).

## Alternativas consideradas

- **embedded-postgres (binário nativo):** rejeitada — baixa de mirror fora do
  allowlist e exige binário por SO.
- **Mockar o repositório nos testes:** rejeitada — não validaria SQL/JSONB reais.
- **Driver único `pg` também nos testes:** exigiria Postgres nativo no CedI/sandbox.
