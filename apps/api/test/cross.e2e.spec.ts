/**
 * Testes e2e do endpoint POST /api/v1/cross (ADR-0020 — incubadora: cruzar é
 * livre, cria descrições na incubadora, NÃO cria espécime, NÃO consome
 * birthQuota (ADR-0021, era revealQuota); só o limite técnico horário —
 * 60/hora, `QuotaGuard` — pode bloquear, com 429).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildApp } from "../src/main";

let app: NestFastifyApplication;
const post = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url: "/api/v1/cross", payload: body, headers });
const get = (url: string, headers: Record<string, string>) => app.inject({ method: "GET", url, headers });
const AUTH_FREE = (id = "user-free") => ({ "x-user-id": id, "x-user-tier": "FREE" });
const AUTH_PHD = { "x-user-id": "user-phd", "x-user-tier": "PHD" };
const CROSS = { sireId: "onca-pintada", damId: "onca-negra", method: "F1" };

// Apaga os DOIS nomes (novo QUOTA_UNLIMITED_DEV e o antigo, ainda aceito por
// compatibilidade, CROSS_QUOTA_UNLIMITED) — o `.env` real de dev pode ter
// qualquer um dos dois definido, e os testes deste arquivo dependem da cota
// valendo de verdade.
let savedQuotaUnlimitedDev: string | undefined;
let savedCrossQuotaUnlimited: string | undefined;
beforeEach(() => {
  savedQuotaUnlimitedDev = process.env.QUOTA_UNLIMITED_DEV; delete process.env.QUOTA_UNLIMITED_DEV;
  savedCrossQuotaUnlimited = process.env.CROSS_QUOTA_UNLIMITED; delete process.env.CROSS_QUOTA_UNLIMITED;
});
afterEach(() => {
  if (savedQuotaUnlimitedDev === undefined) delete process.env.QUOTA_UNLIMITED_DEV;
  else process.env.QUOTA_UNLIMITED_DEV = savedQuotaUnlimitedDev;
  if (savedCrossQuotaUnlimited === undefined) delete process.env.CROSS_QUOTA_UNLIMITED;
  else process.env.CROSS_QUOTA_UNLIMITED = savedCrossQuotaUnlimited;
});

beforeAll(async () => { process.env.NODE_ENV = "test"; process.env.AUTH_DEV_HEADERS = "true"; delete process.env.DATABASE_URL; app = await buildApp(); await app.init(); await app.getHttpAdapter().getInstance().ready(); });
afterAll(async () => { await app.close(); });

describe("POST /api/v1/cross (ADR-0020 — incubadora)", () => {
  it("201: cruzamento válido devolve crossId + descrições na incubadora, SEM espécime", async () => {
    const res = await post(CROSS, AUTH_PHD);
    expect(res.statusCode).toBe(201);
    const b = res.json();
    expect(typeof b.crossId).toBe("string");
    expect(Array.isArray(b.entries)).toBe(true);
    expect(b.entries.length).toBeGreaterThan(0);
    const e = b.entries[0];
    expect(e.sireId).toBe("onca-pintada");
    expect(e.damId).toBe("onca-negra");
    expect(typeof e.id).toBe("string");
    expect(e.genotype).toBeDefined();
    expect(e.phenotype).toBeDefined();
    expect(["M", "F"]).toContain(e.sex);
    // Nenhuma imagem/retrato nasce junto, nem gestação iniciada — isso é
    // trabalho de GESTAR (ADR-0021); cruzar só cria a descrição livre.
    expect(e.gestationStartedAt ?? null).toBeNull();
    expect(e.gestationEndsAt ?? null).toBeNull();
    expect(e.bornSpecimenId ?? null).toBeNull();
    expect(b).not.toHaveProperty("specimen"); // o formato antigo (ADR-0019) não existe mais
  });

  it("401: sem autenticação", async () => { expect((await post(CROSS, {})).statusCode).toBe(401); });
  it("400: método inválido", async () => { expect((await post({ sireId: "onca-pintada", damId: "onca-negra", method: "XYZ" }, AUTH_PHD)).statusCode).toBe(400); });

  it("cruzar NÃO consome birthQuota — GET /me/tier.birthQuota.used continua 0 depois de cruzar várias vezes", async () => {
    const headers = AUTH_FREE("user-no-quota-spend");
    for (let i = 0; i < 3; i++) {
      expect((await post({ sireId: "gato-tabby", damId: "gato-siames", method: "F1" }, headers)).statusCode).toBe(201);
    }
    const me = (await get("/api/v1/me/tier", headers)).json();
    expect(me.birthQuota.used).toBe(0);
  });

  it("limite TÉCNICO horário (61 cruzamentos numa hora) → 429 no 61º", async () => {
    const headers = AUTH_FREE("user-hourly-spam");
    const cross = { sireId: "gato-tabby", damId: "gato-siames", method: "F1" };
    let last = 0;
    for (let i = 0; i < 61; i++) {
      last = (await post(cross, headers)).statusCode;
    }
    expect(last).toBe(429);
  }, 20000);

  it("GET /specimens lista fundadores", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/specimens", headers: { "x-user-id": "demo", "x-user-tier": "PHD" } });
    expect(res.statusCode).toBe(200);
    const ids = res.json().map((s: { id: string }) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["onca-pintada","onca-negra","puma","tigre-bengala","gato-tabby","boerboel"]));
  });

  it("ANTI-P2W: FREE e PHD → mesma descrição de maior probabilidade (mesmo seed)", async () => {
    // gato-tabby × gato-siames (DOMESTIC_CAT — ADR-0016): CROSS (onca-pintada/
    // onca-negra) é WILD_FELINE, fora do pool FREE — FREE receberia 404.
    const fixed = { sireId: "gato-tabby", damId: "gato-siames", method: "F1", seed: "e2e-fixed" };
    const phd = (await post(fixed, { "x-user-id": "p1", "x-user-tier": "PHD" })).json();
    const free = (await post(fixed, { "x-user-id": "f1", "x-user-tier": "FREE" })).json();
    // DECISÃO (rodada de "escolha não varia por plano"): PHD e FREE veem a
    // MESMA quantidade agora (6 — era até 12 pro PHD). A ORDEM (por
    // probabilidade) e o resultado da 1ª (mais provável) têm que ser
    // IDÊNTICOS: a probabilidade do motor não muda por tier.
    expect(phd.entries.length).toBe(6);
    expect(free.entries.length).toBe(6);
    expect(free.entries[0].genotype).toEqual(phd.entries[0].genotype);
    expect(free.entries[0].phenotype).toEqual(phd.entries[0].phenotype);
    expect(free.entries[0].sex).toBe(phd.entries[0].sex);
  });
});
