/**
 * Raça no NASCIMENTO real (POST /cross → gestar → nascer), ADR-0033 adendo 2: o filhote de dois Persas nasce com `breed`
 * "gato-persa"; Persa × Siamês, e tabby × preto (variedades de cor), nascem sem raça. Mesmo padrão de `incubator.e2e.spec.ts`
 * (buildApp/inject, relógio de regra avançado por `SystemClock.setForTesting`, nunca `vi.useFakeTimers`).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildApp } from "../src/main";
import { SystemClock } from "../src/common/clock";
import { FOUNDER_SEX } from "../src/specimens/in-memory.repository";

let app: NestFastifyApplication;
let appClock: SystemClock;
const headersFor = (id: string) => ({ "x-user-id": id, "x-user-tier": "JUNIOR" });
const post = (url: string, body: Record<string, unknown> | undefined, headers: Record<string, string>) =>
  app.inject({ method: "POST", url, payload: body, headers });

const maleOf = (base: string) => (FOUNDER_SEX[base] === "M" ? base : `${base}-macho`);
const femaleOf = (base: string) => (FOUNDER_SEX[base] === "F" ? base : `${base}-femea`);

const SAVED = ["QUOTA_UNLIMITED_DEV", "CROSS_QUOTA_UNLIMITED", "NODE_ENV", "AUTH_DEV_HEADERS", "DATABASE_URL", "FAL_KEY"] as const;
let saved: Record<string, string | undefined>;
beforeAll(async () => {
  saved = Object.fromEntries(SAVED.map((k) => [k, process.env[k]]));
  process.env.NODE_ENV = "test"; process.env.AUTH_DEV_HEADERS = "true";
  delete process.env.DATABASE_URL; delete process.env.FAL_KEY; // em memória e modo procedural
  delete process.env.QUOTA_UNLIMITED_DEV; delete process.env.CROSS_QUOTA_UNLIMITED; // cotas reais (o `.env` local pode liberá-las)
  app = await buildApp(); await app.init(); await app.getHttpAdapter().getInstance().ready();
  appClock = app.get(SystemClock);
});
afterAll(async () => {
  await app.close();
  for (const k of SAVED) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

/** Cruza, gesta, avança o relógio da regra até o fim da gestação e nasce; devolve o espécime nascido. */
async function bornFrom(userId: string, sireId: string, damId: string) {
  const headers = headersFor(userId);
  const crossRes = await post("/api/v1/cross", { sireId, damId, method: "F1" }, headers);
  expect(crossRes.statusCode).toBe(201);
  const entry = crossRes.json().entries[0] as { id: string };
  const gestate = await post(`/api/v1/incubator/${entry.id}/gestate`, undefined, headers);
  expect(gestate.statusCode).toBe(201);
  try {
    appClock.setForTesting(new Date(new Date(gestate.json().gestationEndsAt as string).getTime() + 1000));
    const bornRes = await post(`/api/v1/incubator/${entry.id}/born`, undefined, headers);
    expect(bornRes.statusCode).toBe(201);
    return bornRes.json().specimen as { id: string; species: string; breed: string | null };
  } finally {
    appClock.setForTesting(null);
  }
}

describe("breed no nascimento (POST /incubator/:id/born)", () => {
  it("filhote de dois Persas nasce com breed 'gato-persa'", async () => {
    const s = await bornFrom("breed-born-persa", maleOf("gato-persa"), femaleOf("gato-persa"));
    expect(s.species).toBe("felis-catus");
    expect(s.breed).toBe("gato-persa");
  });

  it("Persa × Siamês nasce SEM raça (mestiço → nulo)", async () => {
    const s = await bornFrom("breed-born-mix", maleOf("gato-persa"), femaleOf("gato-siames"));
    expect(s.breed).toBeNull();
  });

  it("tabby × preto (variedades de cor, não raças) nasce sem raça", async () => {
    const s = await bornFrom("breed-born-cores", maleOf("gato-tabby"), femaleOf("gato-preto"));
    expect(s.breed).toBeNull();
  });
});
