/**
 * AUTH_SECRET (`common/auth-secret.ts`): em produção a API NÃO sobe — nem assina
 * JWT — sem um segredo válido (nada de cair no padrão público
 * `dev-insecure-secret-change-me`, que já assinou tokens de produção em
 * 14/09). Fora de produção mantém o padrão, com aviso 1x por processo.
 *
 * `buildApp` é importado com NODE_ENV=test (o `main.ts` só chama `bootstrap()`
 * fora de "test"); cada caso troca NODE_ENV/AUTH_SECRET e restaura no fim.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { buildApp } from "../src/main";
import {
  authSecretProblem, resolveAuthSecret, assertAuthSecretForBoot, resetAuthSecretWarning,
  INSECURE_DEV_AUTH_SECRET, MIN_AUTH_SECRET_LENGTH,
} from "../src/common/auth-secret";
import { AuthService } from "../src/auth/auth.service";
import { InMemoryUserRepository } from "../src/auth/user.repository";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { makeReferralStack } from "./helpers/referral";

const STRONG = "9f2c4b7a1e8d3c6b5a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b"; // 64 hex, como `openssl rand -hex 32`
const ENV_KEYS = ["NODE_ENV", "AUTH_SECRET", "DATABASE_URL", "AUTH_DEV_HEADERS"] as const;

let saved: Record<string, string | undefined>;
let warnSpy: MockInstance<typeof console.warn>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  delete process.env.AUTH_SECRET;
  delete process.env.DATABASE_URL; // app em memória
  resetAuthSecretWarning();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const defaultWarnings = () => warnSpy.mock.calls.filter((c) => String(c[0]).includes("AUTH_SECRET não definida"));

describe("authSecretProblem — a regra de validade em produção", () => {
  it("aceita um segredo forte (openssl rand -hex 32, 64 caracteres)", () => {
    expect(authSecretProblem(STRONG)).toBeNull();
  });

  it("recusa: ausente/vazio, curto, padrão antigo, placeholders, pontas com espaço, pouca variedade", () => {
    expect(authSecretProblem(undefined)).toMatch(/não está definida/);
    expect(authSecretProblem("")).toMatch(/não está definida/);
    expect(authSecretProblem("curto123")).toMatch(new RegExp(`mínimo é ${MIN_AUTH_SECRET_LENGTH}`));
    expect(authSecretProblem("x".repeat(MIN_AUTH_SECRET_LENGTH - 1))).toMatch(/mínimo/);
    expect(authSecretProblem(INSECURE_DEV_AUTH_SECRET)).not.toBeNull(); // o padrão antigo (29 chars) — recusado
    expect(authSecretProblem(`${INSECURE_DEV_AUTH_SECRET}-${"a1b2c3d4".repeat(4)}`)).toMatch(/óbvio|placeholder/); // longo, mas contém o padrão
    expect(authSecretProblem("mude-o-change-me-por-favor-1234567890abcd")).toMatch(/change-me/);
    expect(authSecretProblem(`${STRONG}\n`)).toMatch(/espaço|quebra/);
    expect(authSecretProblem(` ${STRONG}`)).toMatch(/espaço|quebra/);
    expect(authSecretProblem("a".repeat(40))).toMatch(/repetidos/);
    expect(authSecretProblem("1234".repeat(10))).toMatch(/repetidos/);
  });

  it("aceita exatamente 32 caracteres variados (limite inferior)", () => {
    expect(authSecretProblem("aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0eF")).toBeNull();
  });
});

describe("resolveAuthSecret", () => {
  it("PRODUÇÃO sem AUTH_SECRET → lança com mensagem clara (nunca cai no padrão)", () => {
    process.env.NODE_ENV = "production";
    expect(() => resolveAuthSecret()).toThrow(/AUTH_SECRET inválida em produção: não está definida/);
    expect(() => resolveAuthSecret()).toThrow(/openssl rand -hex 32/);
  });

  it("PRODUÇÃO com o padrão antigo ou um segredo curto → lança", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = INSECURE_DEV_AUTH_SECRET;
    expect(() => resolveAuthSecret()).toThrow(/AUTH_SECRET inválida em produção/);
    process.env.AUTH_SECRET = "curto";
    expect(() => resolveAuthSecret()).toThrow(/mínimo é 32/);
  });

  it("PRODUÇÃO com segredo válido → devolve o valor, sem aviso", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = STRONG;
    expect(resolveAuthSecret()).toBe(STRONG);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("FORA de produção sem AUTH_SECRET → usa o padrão e avisa UMA vez por processo", () => {
    for (const env of ["test", "development", undefined]) {
      resetAuthSecretWarning();
      warnSpy.mockClear();
      if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
      expect(resolveAuthSecret()).toBe(INSECURE_DEV_AUTH_SECRET);
      expect(resolveAuthSecret()).toBe(INSECURE_DEV_AUTH_SECRET);
      expect(defaultWarnings().length).toBe(1); // 1 aviso, não 1 por chamada
    }
  });

  it("FORA de produção com AUTH_SECRET (mesmo curto, como 'test-secret') → usa o valor, sem aviso", () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_SECRET = "test-secret";
    expect(resolveAuthSecret()).toBe("test-secret");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("boot da API (buildApp)", () => {
  it("PRODUÇÃO sem AUTH_SECRET → o boot FALHA com a mensagem clara (antes de criar o app)", async () => {
    process.env.NODE_ENV = "production";
    await expect(buildApp()).rejects.toThrow(/AUTH_SECRET inválida em produção: não está definida/);
  });

  it("PRODUÇÃO com o padrão antigo → o boot falha", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = INSECURE_DEV_AUTH_SECRET;
    await expect(buildApp()).rejects.toThrow(/AUTH_SECRET inválida em produção/);
  });

  it("PRODUÇÃO com AUTH_SECRET válida → sobe normal (com DATABASE_URL, também exigida em produção)", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = STRONG;
    process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/genbreed_test"; // o Pool do pg só conecta na 1ª query — nada de rede no boot
    const app = await buildApp();
    try { await app.init(); expect(app).toBeDefined(); } finally { await app.close(); }
  });

  it("FORA de produção sem AUTH_SECRET → sobe com o padrão e avisa no log", async () => {
    process.env.NODE_ENV = "test";
    const app = await buildApp();
    try {
      await app.init();
      expect(defaultWarnings().length).toBe(1);
    } finally { await app.close(); }
  });

  it("assertAuthSecretForBoot: produção inválida lança; fora de produção só avisa", () => {
    process.env.NODE_ENV = "production";
    expect(() => assertAuthSecretForBoot()).toThrow(/AUTH_SECRET/);
    process.env.NODE_ENV = "development";
    expect(() => assertAuthSecretForBoot()).not.toThrow();
  });
});

describe("AuthService em produção (defesa em profundidade: mesmo se o boot fosse contornado)", () => {
  const makeAuth = () => {
    const wallet = new WalletService(new InMemoryWalletRepository());
    return new AuthService(new InMemoryUserRepository(), makeReferralStack(wallet).referral);
  };

  it("sem AUTH_SECRET válida NÃO assina nem verifica JWT — nunca cai no padrão", async () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_SECRET = STRONG;
    const auth = makeAuth();
    const { token } = await auth.register("a@b.com", "senha12345");

    process.env.NODE_ENV = "production";
    delete process.env.AUTH_SECRET;
    await expect(auth.register("c@d.com", "senha12345")).rejects.toThrow(/AUTH_SECRET inválida em produção/);
    expect(() => auth.verify(token)).toThrow(/AUTH_SECRET inválida em produção/);
  });

  it("com AUTH_SECRET válida em produção: registra, assina e verifica normalmente", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = STRONG;
    const auth = makeAuth();
    const r = await auth.register("a@b.com", "senha12345");
    expect(auth.verify(r.token).sub).toBe(r.user.id);
  });

  it("token forjado com o padrão antigo NÃO é aceito quando o segredo real está definido", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = STRONG;
    const forged = jwt.sign({ sub: "usr_qualquer", tier: "PHD" }, INSECURE_DEV_AUTH_SECRET, { expiresIn: "1h" });
    expect(() => makeAuth().verify(forged)).toThrow();
  });
});
