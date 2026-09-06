/**
 * Testes e2e do endpoint POST /api/v1/cross via Fastify inject.
 * Cobre 201 (sucesso), 401 (sem auth), 400 (DTO inválido) e 429 (cota estourada).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildApp } from "../src/main";

let app: NestFastifyApplication;

function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({ method: "POST", url: "/api/v1/cross", payload: body, headers });
}

const AUTH_FREE = { "x-user-id": "user-free", "x-user-tier": "FREE" };
const AUTH_PHD = { "x-user-id": "user-phd", "x-user-tier": "PHD" };
const BC1 = { sireId: "delta", damId: "negra", method: "BC1" };

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL; // e2e sempre in-memory
  app = await buildApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/v1/cross", () => {
  it("201: cruzamento válido retorna espécime + cacheKey", async () => {
    const res = await post(BC1, AUTH_PHD);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.engine.fPedigree).toBe(0.25);
    expect(typeof body.cacheKey).toBe("string");
    expect(body.specimen.sireId).toBe("delta");
  });

  it("401: sem cabeçalhos de autenticação", async () => {
    const res = await post(BC1, {});
    expect(res.statusCode).toBe(401);
  });

  it("400: método inválido é rejeitado pelo ValidationPipe", async () => {
    const res = await post({ sireId: "delta", damId: "negra", method: "XYZ" }, AUTH_PHD);
    expect(res.statusCode).toBe(400);
  });

  it("429: FREE estoura a cota diária (1/dia) na 2ª requisição", async () => {
    const first = await post(BC1, AUTH_FREE);
    expect(first.statusCode).toBe(201);
    const second = await post(BC1, AUTH_FREE);
    expect(second.statusCode).toBe(429);
  });

  it("GET /api/v1/specimens: lista fundadores do dono", async () => {
    const res = await app.inject({
      method: "GET", url: "/api/v1/specimens",
      headers: { "x-user-id": "demo", "x-user-tier": "PHD" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.map((s: { id: string }) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["puma", "negra", "delta", "golden", "poodle"]));
  });

  it("ANTI-P2W: FREE e PHD obtêm o MESMO resultado genético (só a cota difere)", async () => {
    const fixed = { ...BC1, seed: "e2e-fixed" };
    const phd = (await post(fixed, { "x-user-id": "p1", "x-user-tier": "PHD" })).json();
    const free = (await post(fixed, { "x-user-id": "f1", "x-user-tier": "FREE" })).json();
    expect(free.cacheKey).toBe(phd.cacheKey);
    expect(free.engine.fixationIndex).toBe(phd.engine.fixationIndex);
    expect(free.engine.fPedigree).toBe(phd.engine.fPedigree);
  });
});
