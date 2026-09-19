/**
 * GET /api/v1/public/specimens/:id — compartilhamento viral, SEM login.
 * Sem cabeçalho de auth nenhum de propósito (prova que a rota é mesmo
 * pública); espécime inexistente → 404; resposta é a projeção estrita do
 * item 1 (nunca genótipo/dono/pedigree).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildApp } from "../src/main";

let app: NestFastifyApplication;
const get = (url: string) => app.inject({ method: "GET", url }); // SEM headers — rota pública

beforeAll(async () => {
  process.env.NODE_ENV = "test"; process.env.AUTH_DEV_HEADERS = "true";
  delete process.env.DATABASE_URL; delete process.env.FAL_KEY;
  app = await buildApp(); await app.init(); await app.getHttpAdapter().getInstance().ready();
});
afterAll(async () => { await app.close(); });

describe("GET /api/v1/public/specimens/:id (sem login)", () => {
  it("200: fundador conhecido — devolve só a projeção pública, sem cabeçalho de auth", async () => {
    const res = await get("/api/v1/public/specimens/onca-pintada");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe("onca-pintada");
    expect(typeof body.displayName).toBe("string");
    expect(body.displayName.length).toBeGreaterThan(0);
    expect(typeof body.species).toBe("string");
    expect(typeof body.aura).toBe("number");
    expect(["M", "F", null]).toContain(body.sex);
    expect(typeof body.generation).toBe("number");
    expect(body).toHaveProperty("imageUrl");
    expect(body).toHaveProperty("thumbUrl"); // ADR-0027: miniatura (string) ou null

    // Projeção ESTRITA (item 4/segurança) — nada além do item 1 (+ a miniatura, ADR-0027).
    const allowedKeys = ["id", "displayName", "species", "aura", "sex", "generation", "imageUrl", "thumbUrl"].sort();
    expect(Object.keys(body).sort()).toEqual(allowedKeys);
    expect(body).not.toHaveProperty("genotype");
    expect(body).not.toHaveProperty("phenotype");
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("sireId");
    expect(body).not.toHaveProperty("damId");
    expect(body).not.toHaveProperty("fPedigree");
    expect(body).not.toHaveProperty("fixationIndex");
    expect(body).not.toHaveProperty("cacheKey");
    expect(body).not.toHaveProperty("fertility");
    expect(body).not.toHaveProperty("haldaneStatus");
    expect(body).not.toHaveProperty("status");
  });

  it("nome de exibição de um híbrido usa a mesma cadeia de resolveDisplayName (nunca o slug cru)", async () => {
    // leao-femea×tigre-branco não existe como fundador — usa um par real do
    // catálogo em vez disso: confirma que displayName nunca é igual a `species`
    // quando `species` é um slug técnico (ex.: tem "-" mas não é um nome pronto).
    const res = await get("/api/v1/public/specimens/tigre-branco");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.displayName).toBe("Tigre-branco");
    expect(body.species).toBe("panthera-tigris-branco");
    expect(body.displayName).not.toBe(body.species);
  });

  it("404 pra espécime inexistente", async () => {
    const res = await get("/api/v1/public/specimens/nao-existe-123");
    expect(res.statusCode).toBe(404);
  });
});
