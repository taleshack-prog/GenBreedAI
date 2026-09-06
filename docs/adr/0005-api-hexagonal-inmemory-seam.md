# ADR-0005 — Arquitetura da API (Fase 1): hexagonal com seam de persistência

- **Status:** aceito
- **Data:** 2026-09-05

## Contexto

O gate da Fase 0 foi APROVADO; iniciamos a Fase 1 pela API (TDD §8). O TDD manda
NestJS+Fastify, Drizzle/PostgreSQL (genoma JSONB), Redis+BullMQ e Auth.js. Provê
esses serviços de infra por completo no primeiro corte tornaria o endpoint não
testável sem banco/redis e atrasaria o contrato REST.

## Decisão

1. **NestJS sobre Fastify** já no primeiro corte (contrato REST estável).
2. **Arquitetura hexagonal:** `SpecimenRepository` é uma **porta abstrata**; o
   corte atual usa `InMemorySpecimenRepository` (adapter). O adapter
   Drizzle/PostgreSQL implementa a mesma porta na Fase 1b, sem tocar em
   controllers/serviços.
3. **Cota por Redis** idem: `QuotaService` in-memory hoje; Token Bucket no Redis
   depois, mesma interface (`tryConsume/remaining`).
4. **Auth dev por cabeçalho** (`x-user-id`, `x-user-tier`) como `AuthGuard`
   substituível pela integração Auth.js/JWT (mesmo `AuthenticatedUser`).
5. **Separação anti-P2W enforçada por design:** o tier é lido apenas nos
   guards (Auth/Quota); `CrossService.execute(ownerId, dto)` **não recebe tier** e
   chama o motor com (genótipo+método+seed). Testado (unit + e2e): FREE e PHD
   obtêm `cacheKey`/IF/F idênticos; só a cota diária difere (429).

## Consequências

- Endpoint `POST /api/v1/cross` roda e é testável **sem** banco/redis.
- Migração para Drizzle/Redis/Auth.js é troca de adapter, não reescrita.
- Persistência in-memory é volátil (aceitável para Fase 1a; não usar em produção).

## Alternativas consideradas

- **Esperar Drizzle/Postgres antes de expor a API:** rejeitada — atrasa o contrato
  REST e o valor de teste do slice de cruzamento.
- **Acoplar o repositório diretamente ao serviço:** rejeitada — impede a troca de
  persistência sem reescrever a regra de negócio.
