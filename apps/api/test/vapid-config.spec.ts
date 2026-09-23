/**
 * VAPID no boot (`common/vapid-config.ts`, ADR-0031 adendo 2): só UMA das duas chaves definida falha o boot em produção
 * (hoje o Web Push desligaria em silêncio); as duas ou nenhuma passam; fora de produção só avisa. Mensagens só com NOMES.
 * O `push:dispatch` (cron) tem a própria checagem e não passa por aqui (`cli-boot-isolation.spec.ts`).
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { buildApp } from "../src/main";
import { vapidProblem, assertVapidForBoot, resetVapidWarnings } from "../src/common/vapid-config";
import { resetAuthSecretWarning } from "../src/common/auth-secret";
import { resetDatabaseWarning } from "../src/common/database-url";
import { resetR2Warnings } from "../src/common/r2-config";
import { resetStripeWarnings } from "../src/common/stripe-config";

const STRONG_SECRET = "9f2c4b7a1e8d3c6b5a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b";
const FAKE_DB = "postgresql://user:senha-secreta@127.0.0.1:5432/genbreed_test";
const ENV_KEYS = [
  "NODE_ENV", "AUTH_SECRET", "DATABASE_URL", "FAL_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_SUCCESS_URL", "STRIPE_CANCEL_URL",
] as const;
const PUB = "VALORSECRETO-publica";
const PRIV = "VALORSECRETO-privada";

let saved: Record<string, string | undefined>;
let warnSpy: MockInstance<typeof console.warn>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) if (k !== "NODE_ENV") delete process.env[k];
  resetVapidWarnings(); resetAuthSecretWarning(); resetDatabaseWarning(); resetR2Warnings(); resetStripeWarnings();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const setVapid = (pub: string | null, priv: string | null) => {
  if (pub === null) delete process.env.VAPID_PUBLIC_KEY; else process.env.VAPID_PUBLIC_KEY = pub;
  if (priv === null) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = priv;
};
const pushWarnings = () => warnSpy.mock.calls.filter((c) => String(c[0]).startsWith("[push]"));
const messageOf = (fn: () => void): string => { try { fn(); } catch (e) { return (e as Error).message; } return ""; };
const noValueLeaked = (msg: string) => expect(msg).not.toContain("VALORSECRETO");

describe("vapidProblem (pura)", () => {
  it("as duas ou nenhuma → sem problema; só uma → nomeia a definida e a que falta", () => {
    expect(vapidProblem({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" } as NodeJS.ProcessEnv)).toBeNull();
    expect(vapidProblem({} as NodeJS.ProcessEnv)).toBeNull();
    expect(vapidProblem({ VAPID_PUBLIC_KEY: "a" } as NodeJS.ProcessEnv)).toMatch(/VAPID_PUBLIC_KEY definida, FALTA VAPID_PRIVATE_KEY/);
    expect(vapidProblem({ VAPID_PRIVATE_KEY: "b" } as NodeJS.ProcessEnv)).toMatch(/VAPID_PRIVATE_KEY definida, FALTA VAPID_PUBLIC_KEY/);
  });
  it("em branco/só espaço conta como faltando (mesma regra de vapidConfig)", () => {
    expect(vapidProblem({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "   " } as NodeJS.ProcessEnv)).toMatch(/FALTA VAPID_PRIVATE_KEY/);
    expect(vapidProblem({ VAPID_PUBLIC_KEY: " ", VAPID_PRIVATE_KEY: "" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("PRODUÇÃO", () => {
  beforeEach(() => { process.env.NODE_ENV = "production"; });

  it.each([
    ["só a pública", PUB, null, "VAPID_PUBLIC_KEY definida, FALTA VAPID_PRIVATE_KEY"],
    ["só a privada", null, PRIV, "VAPID_PRIVATE_KEY definida, FALTA VAPID_PUBLIC_KEY"],
    ["pública + privada em branco", PUB, "   ", "VAPID_PUBLIC_KEY definida, FALTA VAPID_PRIVATE_KEY"],
  ])("%s → o boot FALHA, dizendo qual falta (e nenhum valor aparece)", (_l, pub, priv, detail) => {
    setVapid(pub, priv);
    const msg = messageOf(() => assertVapidForBoot());
    expect(msg).toMatch(/\[push\] VAPID inválido em produção/);
    expect(msg).toContain(detail);
    expect(msg).toMatch(/a API NÃO sobe/);
    noValueLeaked(msg);
  });

  it("as duas definidas → passa, sem aviso", () => {
    setVapid(PUB, PRIV);
    expect(() => assertVapidForBoot()).not.toThrow();
    expect(pushWarnings()).toEqual([]);
  });

  it("nenhuma → passa em silêncio (push desligado é escolha válida)", () => {
    expect(() => assertVapidForBoot()).not.toThrow();
    expect(pushWarnings()).toEqual([]);
  });
});

describe("FORA de produção nada falha — só avisa", () => {
  it.each(["test", "development", undefined])("NODE_ENV=%s: metade das chaves não lança; avisa 1x por processo, sem valores", (env) => {
    if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
    resetVapidWarnings(); warnSpy.mockClear();
    setVapid(PUB, null);
    expect(() => assertVapidForBoot()).not.toThrow();
    expect(() => assertVapidForBoot()).not.toThrow();
    expect(pushWarnings()).toHaveLength(1);
    const msg = String(pushWarnings()[0]![0]);
    expect(msg).toMatch(/DESLIGADO/);
    noValueLeaked(msg);
  });

  it("as duas ou nenhuma → silêncio", () => {
    process.env.NODE_ENV = "development";
    setVapid(PUB, PRIV); assertVapidForBoot();
    setVapid(null, null); assertVapidForBoot();
    expect(pushWarnings()).toEqual([]);
  });
});

describe("boot da API (buildApp)", () => {
  const prodEnv = () => { process.env.NODE_ENV = "production"; process.env.AUTH_SECRET = STRONG_SECRET; process.env.DATABASE_URL = FAKE_DB; };

  it("PRODUÇÃO + VAPID pela metade → o boot FALHA", async () => {
    prodEnv();
    setVapid(null, PRIV);
    let msg = "";
    await buildApp().catch((e: Error) => { msg = e.message; });
    expect(msg).toMatch(/\[push\] VAPID inválido em produção/);
    noValueLeaked(msg);
    expect(msg).not.toContain("senha-secreta");
  });

  it("PRODUÇÃO + as duas chaves → sobe normal; PRODUÇÃO sem nenhuma → sobe normal", async () => {
    for (const [pub, priv] of [[PUB, PRIV], [null, null]] as const) {
      prodEnv();
      setVapid(pub, priv);
      const app = await buildApp();
      try { await app.init(); expect(app).toBeDefined(); } finally { await app.close(); }
    }
  });
});
