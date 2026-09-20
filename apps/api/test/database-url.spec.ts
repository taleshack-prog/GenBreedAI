/**
 * DATABASE_URL no boot (`common/database-url.ts`): em produção a API NÃO sobe
 * sem ela (senão rodaria em memória e perderia tudo a cada reinício, em
 * silêncio). Fora de produção mantém o modo em memória e avisa 1x por processo.
 * Mesmo padrão de `auth-secret.spec.ts`; `buildApp` é importado com
 * NODE_ENV=test (o `main.ts` só chama `bootstrap()` fora de "test").
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { buildApp } from "../src/main";
import { databaseUrlProblem, assertDatabaseForBoot, resetDatabaseWarning } from "../src/common/database-url";
import { resetAuthSecretWarning } from "../src/common/auth-secret";
import { SpecimenRepository, InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { DrizzleSpecimenRepository } from "../src/specimens/drizzle.repository";

const STRONG_SECRET = "9f2c4b7a1e8d3c6b5a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b";
const FAKE_URL = "postgresql://user:senha-secreta@127.0.0.1:5432/genbreed_test"; // o Pool do pg só conecta na 1ª query — sem rede no boot
// FAL_KEY e as R2_* também são isoladas: o boot em PRODUÇÃO valida o R2 (ADR-0031) e `main.ts` carrega o `.env` local.
const ENV_KEYS = [
  "NODE_ENV", "AUTH_SECRET", "DATABASE_URL",
  "FAL_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL",
] as const;

let saved: Record<string, string | undefined>;
let warnSpy: MockInstance<typeof console.warn>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  delete process.env.AUTH_SECRET;
  delete process.env.DATABASE_URL;
  for (const k of ["FAL_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"]) delete process.env[k];
  resetDatabaseWarning();
  resetAuthSecretWarning();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const inMemoryWarnings = () => warnSpy.mock.calls.filter((c) => String(c[0]).includes("DATABASE_URL não definida"));

describe("databaseUrlProblem — o que uma DATABASE_URL de produção precisa ter", () => {
  it("aceita URLs de Postgres (Neon, local, com sslmode)", () => {
    expect(databaseUrlProblem("postgresql://user:pass@ep-abc-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require")).toBeNull();
    expect(databaseUrlProblem("postgres://user:pass@localhost:5432/db")).toBeNull();
    expect(databaseUrlProblem("POSTGRESQL://user:pass@host/db")).toBeNull();
  });

  it("aceita senha com caracteres especiais sem escape (não faz new URL — sem falso positivo que derrube o deploy)", () => {
    expect(databaseUrlProblem("postgresql://user:p@ss#w/rd@host:5432/db")).toBeNull();
  });

  it("recusa: ausente/vazio, espaço/quebra de linha, protocolo errado, só o esquema", () => {
    expect(databaseUrlProblem(undefined)).toMatch(/não está definida/);
    expect(databaseUrlProblem("")).toMatch(/não está definida/);
    expect(databaseUrlProblem(" postgresql://u:p@h/db")).toMatch(/espaço|quebra/);
    expect(databaseUrlProblem("postgresql://u:p@h/db\n")).toMatch(/espaço|quebra/);
    expect(databaseUrlProblem("mysql://u:p@h/db")).toMatch(/postgres/);
    expect(databaseUrlProblem("neondb")).toMatch(/postgres/);
    expect(databaseUrlProblem("postgresql://")).toMatch(/postgres/);
  });
});

describe("assertDatabaseForBoot", () => {
  it("PRODUÇÃO sem DATABASE_URL → lança com mensagem clara (e sem imprimir valor nenhum)", () => {
    process.env.NODE_ENV = "production";
    expect(() => assertDatabaseForBoot()).toThrow(/DATABASE_URL inválida em produção: não está definida/);
    expect(() => assertDatabaseForBoot()).toThrow(/MEMÓRIA/);
    expect(() => assertDatabaseForBoot()).toThrow(/Railway/);
  });

  it("PRODUÇÃO com valor inválido → lança, sem vazar a senha na mensagem", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "mysql://user:senha-secreta@host/db";
    let msg = "";
    try { assertDatabaseForBoot(); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/DATABASE_URL inválida em produção/);
    expect(msg).not.toContain("senha-secreta");
  });

  it("PRODUÇÃO com URL válida → não lança e não avisa", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = FAKE_URL;
    expect(() => assertDatabaseForBoot()).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("FORA de produção sem DATABASE_URL → não lança; avisa UMA vez por processo que os dados não persistem", () => {
    for (const env of ["test", "development", undefined]) {
      resetDatabaseWarning();
      warnSpy.mockClear();
      if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
      expect(() => assertDatabaseForBoot()).not.toThrow();
      expect(() => assertDatabaseForBoot()).not.toThrow();
      expect(inMemoryWarnings().length).toBe(1); // 1 aviso, não 1 por chamada
      expect(String(inMemoryWarnings()[0]![0])).toMatch(/NÃO persistem/);
    }
  });

  it("FORA de produção COM DATABASE_URL → sem aviso", () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = FAKE_URL;
    assertDatabaseForBoot();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("boot da API (buildApp)", () => {
  it("PRODUÇÃO sem DATABASE_URL → o boot FALHA com a mensagem clara (antes de criar o app)", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = STRONG_SECRET; // a validação do segredo passa; é a do banco que barra
    await expect(buildApp()).rejects.toThrow(/DATABASE_URL inválida em produção: não está definida/);
  });

  it("PRODUÇÃO sem AUTH_SECRET E sem DATABASE_URL → falha (a validação do segredo vem primeiro, mesmo lugar do boot)", async () => {
    process.env.NODE_ENV = "production";
    await expect(buildApp()).rejects.toThrow(/AUTH_SECRET inválida em produção/);
  });

  it("PRODUÇÃO com DATABASE_URL (e AUTH_SECRET) → sobe normal, com repositórios do POSTGRES (não em memória)", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = STRONG_SECRET;
    process.env.DATABASE_URL = FAKE_URL;
    const app = await buildApp();
    try {
      await app.init();
      expect(app.get(SpecimenRepository)).toBeInstanceOf(DrizzleSpecimenRepository);
      expect(app.get(SpecimenRepository)).not.toBeInstanceOf(InMemorySpecimenRepository);
    } finally { await app.close(); }
  });

  it("FORA de produção sem DATABASE_URL → sobe EM MEMÓRIA e avisa no log", async () => {
    process.env.NODE_ENV = "test";
    const app = await buildApp();
    try {
      await app.init();
      expect(app.get(SpecimenRepository)).toBeInstanceOf(InMemorySpecimenRepository);
      expect(inMemoryWarnings().length).toBe(1);
    } finally { await app.close(); }
  });
});
