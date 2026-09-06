/** Testes e2e do endpoint POST /api/v1/cross (modelo v2). */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildApp } from "../src/main";

let app: NestFastifyApplication;
const post = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url: "/api/v1/cross", payload: body, headers });
const AUTH_FREE = { "x-user-id": "user-free", "x-user-tier": "FREE" };
const AUTH_PHD = { "x-user-id": "user-phd", "x-user-tier": "PHD" };
const CROSS = { sireId: "onca-pintada", damId: "onca-negra", method: "F1" };

beforeAll(async () => { process.env.NODE_ENV = "test"; delete process.env.DATABASE_URL; app = await buildApp(); await app.init(); await app.getHttpAdapter().getInstance().ready(); });
afterAll(async () => { await app.close(); });

describe("POST /api/v1/cross", () => {
  it("201: cruzamento válido retorna espécime + cacheKey", async () => {
    const res = await post(CROSS, AUTH_PHD);
    expect(res.statusCode).toBe(201);
    const b = res.json();
    expect(typeof b.cacheKey).toBe("string");
    expect(b.specimen.sireId).toBe("onca-pintada");
  });
  it("401: sem autenticação", async () => { expect((await post(CROSS, {})).statusCode).toBe(401); });
  it("400: método inválido", async () => { expect((await post({ sireId: "onca-pintada", damId: "onca-negra", method: "XYZ" }, AUTH_PHD)).statusCode).toBe(400); });
  it("429: FREE estoura cota (1/dia) na 2ª", async () => {
    expect((await post(CROSS, AUTH_FREE)).statusCode).toBe(201);
    expect((await post(CROSS, AUTH_FREE)).statusCode).toBe(429);
  });
  it("GET /specimens lista fundadores", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/specimens", headers: { "x-user-id": "demo", "x-user-tier": "PHD" } });
    expect(res.statusCode).toBe(200);
    const ids = res.json().map((s: { id: string }) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["onca-pintada","onca-negra","puma","tigre-bengala","gato-tabby","boerboel"]));
  });
  it("ANTI-P2W: FREE e PHD → mesmo resultado genético", async () => {
    const fixed = { ...CROSS, seed: "e2e-fixed" };
    const phd = (await post(fixed, { "x-user-id": "p1", "x-user-tier": "PHD" })).json();
    const free = (await post(fixed, { "x-user-id": "f1", "x-user-tier": "FREE" })).json();
    expect(free.cacheKey).toBe(phd.cacheKey);
  });
});
