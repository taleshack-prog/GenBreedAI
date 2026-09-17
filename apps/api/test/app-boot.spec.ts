/**
 * Sobe o AppModule inteiro (mesmo `buildApp()` de src/main.ts usado por
 * test/cross.e2e.spec.ts — NestFactory.create(AppModule, FastifyAdapter),
 * sem @nestjs/testing, que não está instalado neste pacote), sem
 * DATABASE_URL (modo em memória) — pega em CI/teste o que só apareceria em
 * produção: qualquer dependência do grafo de DI que não resolva (Nest
 * instancia — e falha — o grafo completo dentro de NestFactory.create(),
 * antes mesmo de app.listen()).
 *
 * Motivado pelo bug de produção "Nest can't resolve dependencies of the
 * ImageController (ImageService, ?). Please make sure that the argument
 * TierService at index [1] is available in the ImageModule context." —
 * ImageModule usava TierService (via ImageController/ImageQuotaController)
 * sem importar TierModule. Este teste falha sempre que uma lacuna dessas
 * for reintroduzida, sem precisar derrubar a API de verdade pra descobrir.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildApp } from "../src/main";

let app: NestFastifyApplication;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL; // modo em memória — mesmo caminho que quebraria em produção se faltasse algo
  app = await buildApp();
  await app.init();
});

afterAll(async () => { await app.close(); });

describe("AppModule — boot completo", () => {
  it("NestFactory.create(AppModule) + app.init() sem DATABASE_URL não lança — nenhuma dependência de módulo ficou sem resolver", () => {
    expect(app).toBeDefined();
  });
});
