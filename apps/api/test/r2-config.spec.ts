/**
 * R2 no boot (`common/r2-config.ts`, ADR-0031): sem as cinco `R2_*` o storage cai no DISCO do contêiner e os retratos
 * somem no próximo deploy, em silêncio. Regra:
 *  1. produção + FAL_KEY: as cinco são obrigatórias (faltando qualquer uma → o boot FALHA);
 *  2. produção + configuração PARCIAL (1 a 4): FALHA mesmo sem FAL_KEY;
 *  3. produção sem FAL_KEY e sem nenhuma R2_*: passa, com aviso 1x por processo (modo procedural);
 *  4. fora de produção nada falha: só avisa quando cairia no disco local (imagens não persistem).
 * Mensagens só com NOMES de variável — nunca valores. `buildApp` é importado com NODE_ENV=test (o `main.ts` só chama
 * `bootstrap()` fora de "test" e carrega o `.env` local por dotenv — por isso o isolamento de env abaixo).
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { buildApp } from "../src/main";
import { R2_VARS, r2Status, r2ProductionProblem, assertR2ForBoot, resetR2Warnings, type R2Var } from "../src/common/r2-config";
import { resetAuthSecretWarning } from "../src/common/auth-secret";
import { resetDatabaseWarning } from "../src/common/database-url";

const STRONG_SECRET = "9f2c4b7a1e8d3c6b5a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b";
const FAKE_DB = "postgresql://user:senha-secreta@127.0.0.1:5432/genbreed_test"; // o Pool do pg só conecta na 1ª query — sem rede no boot
const ENV_KEYS = [
  "NODE_ENV", "AUTH_SECRET", "DATABASE_URL", "FAL_KEY", ...R2_VARS,
  // Stripe e VAPID também são validados no boot em produção (ADR-0031, adendo 2); o `.env` local pode defini-los.
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_SUCCESS_URL", "STRIPE_CANCEL_URL", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY",
] as const;
/** Valores INCONFUNDÍVEIS: se algum aparecer numa mensagem, o teste acusa vazamento. */
const SECRET_VALUE = (k: string) => `VALOR-SECRETO-DE-${k}-9x7q`;

let saved: Record<string, string | undefined>;
let warnSpy: MockInstance<typeof console.warn>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) if (k !== "NODE_ENV") delete process.env[k];
  resetR2Warnings(); resetAuthSecretWarning(); resetDatabaseWarning();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const setR2 = (names: readonly R2Var[]) => { for (const k of R2_VARS) delete process.env[k]; for (const k of names) process.env[k] = SECRET_VALUE(k); };
const r2Warnings = () => warnSpy.mock.calls.filter((c) => String(c[0]).startsWith("[storage]"));
const messageOf = (fn: () => void): string => { try { fn(); } catch (e) { return (e as Error).message; } return ""; };
const noValueLeaked = (msg: string) => { for (const k of R2_VARS) expect(msg, k).not.toContain(SECRET_VALUE(k)); expect(msg).not.toContain("VALOR-SECRETO"); expect(msg).not.toContain("chave-fal-secreta"); };

describe("r2Status — o que está definido (pura)", () => {
  it("separa definidas e faltantes; vazio e só espaço contam como FALTANDO", () => {
    const s = r2Status({ R2_ACCOUNT_ID: "a", R2_BUCKET: "b", R2_PUBLIC_URL: "   ", R2_SECRET_ACCESS_KEY: "" } as NodeJS.ProcessEnv);
    expect(s.present).toEqual(["R2_ACCOUNT_ID", "R2_BUCKET"]);
    expect(s.missing).toEqual(["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_URL"]);
    expect(s).toMatchObject({ complete: false, none: false, falKey: false });
  });
  it("as cinco definidas → completo; nenhuma → none; FAL_KEY em branco não conta", () => {
    const all = Object.fromEntries(R2_VARS.map((k) => [k, "x"])) as NodeJS.ProcessEnv;
    expect(r2Status(all)).toMatchObject({ complete: true, none: false, missing: [] });
    expect(r2Status({ FAL_KEY: "  " } as NodeJS.ProcessEnv)).toMatchObject({ complete: false, none: true, falKey: false });
    expect(r2Status({ FAL_KEY: "k" } as NodeJS.ProcessEnv).falKey).toBe(true);
  });
});

describe("PRODUÇÃO — as quatro combinações", () => {
  beforeEach(() => { process.env.NODE_ENV = "production"; });

  describe("1. COM FAL_KEY: as cinco R2_* são obrigatórias", () => {
    beforeEach(() => { process.env.FAL_KEY = "chave-fal-secreta"; });

    it("as cinco definidas → passa, sem aviso", () => {
      setR2(R2_VARS);
      expect(() => assertR2ForBoot()).not.toThrow();
      expect(r2Warnings()).toEqual([]);
      expect(r2ProductionProblem()).toBeNull();
    });

    it.each(R2_VARS)("faltando SÓ %s → o boot FALHA, dizendo exatamente qual falta (e nenhum valor aparece)", (missing) => {
      setR2(R2_VARS.filter((k) => k !== missing));
      const msg = messageOf(() => assertR2ForBoot());
      expect(msg).toMatch(/R2 inválido em produção/);
      expect(msg).toMatch(new RegExp(`FALTAM ${missing}[.;]`)); // só a que falta, na lista de FALTAM
      expect(msg).toMatch(/DISCO do contêiner/);
      expect(msg).toMatch(/SOMEM no próximo deploy/);
      noValueLeaked(msg);
    });

    it("nenhuma das cinco → FALHA listando as cinco como faltantes", () => {
      const msg = messageOf(() => assertR2ForBoot());
      expect(msg).toMatch(/FAL_KEY está definida/);
      for (const k of R2_VARS) expect(msg).toContain(k);
      noValueLeaked(msg);
    });

    it("valor vazio ou só espaço equivale a FALTAR", () => {
      setR2(R2_VARS);
      process.env.R2_BUCKET = "   ";
      expect(messageOf(() => assertR2ForBoot())).toMatch(/FALTAM R2_BUCKET/);
      process.env.R2_BUCKET = "";
      expect(messageOf(() => assertR2ForBoot())).toMatch(/FALTAM R2_BUCKET/);
    });
  });

  describe("2. configuração PARCIAL (1 a 4) falha MESMO SEM FAL_KEY", () => {
    it.each([1, 2, 3, 4])("com %i das cinco definidas e sem FAL_KEY → FALHA (erro de digitação, não escolha)", (n) => {
      setR2(R2_VARS.slice(0, n));
      const msg = messageOf(() => assertR2ForBoot());
      expect(msg).toMatch(/configuração PARCIAL do R2/);
      for (const k of R2_VARS.slice(n)) expect(msg).toContain(k);
      noValueLeaked(msg);
    });

    it("cada uma das cinco, sozinha e sem FAL_KEY, também falha; e as quatro restantes idem", () => {
      for (const only of R2_VARS) {
        setR2([only]);
        expect(() => assertR2ForBoot(), `só ${only}`).toThrow(/PARCIAL/);
        setR2(R2_VARS.filter((k) => k !== only));
        expect(() => assertR2ForBoot(), `todas menos ${only}`).toThrow(new RegExp(`FALTAM ${only}`));
      }
    });
  });

  describe("3. SEM FAL_KEY e SEM nenhuma R2_* → passa (modo procedural), com aviso 1x por processo", () => {
    it("não lança e avisa uma única vez, mesmo chamando várias vezes", () => {
      expect(() => assertR2ForBoot()).not.toThrow();
      expect(() => assertR2ForBoot()).not.toThrow();
      expect(() => assertR2ForBoot()).not.toThrow();
      expect(r2Warnings()).toHaveLength(1);
      expect(String(r2Warnings()[0]![0])).toMatch(/PROCEDURAL/);
      expect(String(r2Warnings()[0]![0])).toMatch(/nenhum retrato é gerado nem guardado/);
      expect(r2ProductionProblem()).toBeNull();
    });
    it("sem FAL_KEY mas com as cinco R2_* → passa em silêncio (nada a avisar)", () => {
      setR2(R2_VARS);
      expect(() => assertR2ForBoot()).not.toThrow();
      expect(r2Warnings()).toEqual([]);
    });
  });
});

describe("4. FORA de produção nada falha — só avisa quando cai no disco local", () => {
  it.each(["test", "development", undefined])("NODE_ENV=%s: nunca lança, em nenhuma combinação", (env) => {
    if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
    for (const fal of [false, true]) {
      for (const names of [[], R2_VARS.slice(0, 1), R2_VARS.slice(0, 4), R2_VARS] as R2Var[][]) {
        setR2(names);
        if (fal) process.env.FAL_KEY = "chave-fal-secreta"; else delete process.env.FAL_KEY;
        expect(() => assertR2ForBoot(), `fal=${fal} r2=${names.length}`).not.toThrow();
      }
    }
  });

  it("COM FAL_KEY e sem R2 (o caso do dev local): avisa que as imagens vão pro DISCO LOCAL e NÃO persistem — 1x por processo", () => {
    process.env.NODE_ENV = "development"; process.env.FAL_KEY = "chave-fal-secreta";
    assertR2ForBoot(); assertR2ForBoot();
    expect(r2Warnings()).toHaveLength(1);
    const msg = String(r2Warnings()[0]![0]);
    expect(msg).toMatch(/DISCO LOCAL/);
    expect(msg).toMatch(/NÃO persistem/);
    expect(msg).toMatch(/nenhuma R2_\* definida/);
    noValueLeaked(msg);
  });

  it("R2 PARCIAL (mesmo sem FAL_KEY): avisa quais faltam; sem valores", () => {
    process.env.NODE_ENV = "test";
    setR2(R2_VARS.slice(0, 3));
    assertR2ForBoot();
    expect(r2Warnings()).toHaveLength(1);
    const msg = String(r2Warnings()[0]![0]);
    expect(msg).toMatch(/faltam R2_BUCKET, R2_PUBLIC_URL/);
    expect(msg).toMatch(/NÃO persistem/);
    noValueLeaked(msg);
  });

  it("silêncio quando não há o que avisar: as cinco definidas; ou sem FAL_KEY e sem R2 (nada é gravado)", () => {
    process.env.NODE_ENV = "development";
    setR2(R2_VARS); process.env.FAL_KEY = "chave-fal-secreta";
    assertR2ForBoot();
    setR2([]); delete process.env.FAL_KEY;
    assertR2ForBoot();
    expect(r2Warnings()).toEqual([]);
  });
});

describe("boot da API (buildApp)", () => {
  const prodEnv = () => { process.env.NODE_ENV = "production"; process.env.AUTH_SECRET = STRONG_SECRET; process.env.DATABASE_URL = FAKE_DB; };

  it("PRODUÇÃO + FAL_KEY + R2 incompleto → o boot FALHA com a mensagem clara, antes de criar o app", async () => {
    prodEnv();
    process.env.FAL_KEY = "chave-fal-secreta";
    setR2(R2_VARS.filter((k) => k !== "R2_PUBLIC_URL"));
    let msg = "";
    await buildApp().catch((e: Error) => { msg = e.message; });
    expect(msg).toMatch(/\[storage\] R2 inválido em produção/);
    expect(msg).toMatch(/FALTAM R2_PUBLIC_URL/);
    noValueLeaked(msg);
    expect(msg).not.toContain("senha-secreta");
  });

  it("PRODUÇÃO + R2 PARCIAL sem FAL_KEY → o boot FALHA (a regra 2 vale no boot real)", async () => {
    prodEnv();
    setR2(["R2_ACCOUNT_ID"]);
    await expect(buildApp()).rejects.toThrow(/configuração PARCIAL do R2/);
  });

  it("PRODUÇÃO + FAL_KEY + as cinco R2_* → sobe normal", async () => {
    prodEnv();
    process.env.FAL_KEY = "chave-fal-secreta";
    setR2(R2_VARS);
    const app = await buildApp();
    try { await app.init(); expect(app).toBeDefined(); } finally { await app.close(); }
  });

  it("PRODUÇÃO sem FAL_KEY e sem R2 → sobe (modo procedural), com o aviso", async () => {
    prodEnv();
    const app = await buildApp();
    try {
      await app.init();
      expect(r2Warnings().some((c) => /PROCEDURAL/.test(String(c[0])))).toBe(true);
    } finally { await app.close(); }
  });

  it("FORA de produção com FAL_KEY e sem R2 → sobe EM DISCO LOCAL e avisa", async () => {
    process.env.NODE_ENV = "test"; process.env.FAL_KEY = "chave-fal-secreta";
    const app = await buildApp();
    try {
      await app.init();
      expect(r2Warnings().some((c) => /DISCO LOCAL/.test(String(c[0])))).toBe(true);
    } finally { await app.close(); }
  });
});
