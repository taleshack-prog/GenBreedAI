/**
 * Stripe no boot (`common/stripe-config.ts`, ADR-0031 adendo 2): com STRIPE_SECRET_KEY o billing real está ligado; sem
 * STRIPE_WEBHOOK_SECRET o jogador paga e nada é entregue, e sem URLs https de retorno o cliente volta para o localhost.
 *  1. produção + STRIPE_SECRET_KEY: STRIPE_WEBHOOK_SECRET, STRIPE_SUCCESS_URL e STRIPE_CANCEL_URL obrigatórias (o boot FALHA);
 *  2. as duas URLs precisam ser https e não apontar para localhost;
 *  3. produção sem STRIPE_SECRET_KEY: passa (billing desligado), com aviso 1x por processo;
 *  4. fora de produção nada falha — só avisa (chave sem segredo do webhook).
 * Mensagens só com NOMES de variável, nunca valores.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { buildApp } from "../src/main";
import {
  STRIPE_URL_VARS, stripeKeyActive, stripeUrlProblem, stripeProductionProblems, assertStripeForBoot, resetStripeWarnings,
} from "../src/common/stripe-config";
import { resetAuthSecretWarning } from "../src/common/auth-secret";
import { resetDatabaseWarning } from "../src/common/database-url";
import { resetR2Warnings } from "../src/common/r2-config";
import { resetVapidWarnings } from "../src/common/vapid-config";

const STRONG_SECRET = "9f2c4b7a1e8d3c6b5a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b";
const FAKE_DB = "postgresql://user:senha-secreta@127.0.0.1:5432/genbreed_test";
const STRIPE_VARS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", ...STRIPE_URL_VARS] as const;
type StripeVar = (typeof STRIPE_VARS)[number];
const ENV_KEYS = [
  "NODE_ENV", "AUTH_SECRET", "DATABASE_URL", "FAL_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY",
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL", ...STRIPE_VARS,
] as const;

/** Valores INCONFUNDÍVEIS: se algum aparecer numa mensagem, o teste acusa vazamento. */
const GOOD: Record<StripeVar, string> = {
  STRIPE_SECRET_KEY: "sk_live_VALORSECRETO_chave",
  STRIPE_WEBHOOK_SECRET: "whsec_VALORSECRETO_webhook",
  STRIPE_SUCCESS_URL: "https://valorsecreto.genbreed.com.br/app/profile?billing=success&session_id={CHECKOUT_SESSION_ID}",
  STRIPE_CANCEL_URL: "https://valorsecreto.genbreed.com.br/app/profile?billing=cancel",
};

let saved: Record<string, string | undefined>;
let warnSpy: MockInstance<typeof console.warn>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) if (k !== "NODE_ENV") delete process.env[k];
  resetStripeWarnings(); resetAuthSecretWarning(); resetDatabaseWarning(); resetR2Warnings(); resetVapidWarnings();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

/** `over`: variável → valor (ou `null` = removida); o que não estiver em `over` recebe o valor BOM de `GOOD`. */
const setStripe = (over: Record<string, string | null> = {}) => {
  for (const k of STRIPE_VARS) {
    const v = k in over ? over[k] : GOOD[k];
    if (v === null || v === undefined) delete process.env[k]; else process.env[k] = v;
  }
};
const billingWarnings = () => warnSpy.mock.calls.filter((c) => String(c[0]).startsWith("[billing]"));
const messageOf = (fn: () => void): string => { try { fn(); } catch (e) { return (e as Error).message; } return ""; };
const noValueLeaked = (msg: string) => {
  expect(msg.toLowerCase()).not.toContain("valorsecreto");
  expect(msg).not.toContain("whsec_");
  expect(msg).not.toContain("sk_live_");
};

describe("stripeUrlProblem — o que uma URL de retorno precisa ter em produção (pura)", () => {
  it("aceita https com domínio real, com caminho, query e o marcador {CHECKOUT_SESSION_ID}", () => {
    expect(stripeUrlProblem(GOOD.STRIPE_SUCCESS_URL)).toBeNull();
    expect(stripeUrlProblem(GOOD.STRIPE_CANCEL_URL)).toBeNull();
    expect(stripeUrlProblem("https://genbreed.com.br")).toBeNull();
    expect(stripeUrlProblem("HTTPS://GenBreed.com.br/app")).toBeNull();
  });

  it.each([
    ["ausente", undefined, /não está definida/],
    ["vazia", "", /não está definida/],
    ["só espaço", "   ", /não está definida/],
    ["espaço/quebra de linha nas pontas", "https://genbreed.com.br/app\n", /espaço|quebra/],
    ["http (sem TLS)", "http://genbreed.com.br/app", /https/],
    ["sem esquema", "genbreed.com.br/app", /URL válida|https/],
    ["texto solto", "checkout", /URL válida/],
    ["localhost com http", "http://localhost:3000/app/profile", /localhost/],
    ["localhost com https", "https://localhost:3000/app/profile", /localhost/],
    ["127.0.0.1", "https://127.0.0.1/app", /localhost/],
    ["127.x qualquer", "https://127.1.2.3/app", /localhost/],
    ["0.0.0.0", "https://0.0.0.0/app", /localhost/],
    ["IPv6 loopback", "https://[::1]/app", /localhost/],
    ["subdomínio .localhost", "https://app.localhost/app", /localhost/],
    ["LOCALHOST em maiúsculas", "https://LOCALHOST/app", /localhost/],
    ["ftp", "ftp://genbreed.com.br/app", /https/],
  ])("recusa: %s", (_l, raw, re) => {
    expect(stripeUrlProblem(raw)).toMatch(re);
  });

  it("o motivo nunca inclui o valor recebido", () => {
    for (const raw of ["http://valorsecreto.example/x", "https://localhost/valorsecreto", "valorsecreto"]) {
      expect((stripeUrlProblem(raw) ?? "").toLowerCase()).not.toContain("valorsecreto");
    }
  });
});

describe("stripeKeyActive — mesma regra de resolvePaymentProvider (truthiness)", () => {
  it("definida e não vazia → ativa; ausente ou vazia → não", () => {
    expect(stripeKeyActive({ STRIPE_SECRET_KEY: "sk_test_x" } as NodeJS.ProcessEnv)).toBe(true);
    expect(stripeKeyActive({ STRIPE_SECRET_KEY: "   " } as NodeJS.ProcessEnv)).toBe(true); // o provider criaria o cliente Stripe
    expect(stripeKeyActive({ STRIPE_SECRET_KEY: "" } as NodeJS.ProcessEnv)).toBe(false);
    expect(stripeKeyActive({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("PRODUÇÃO", () => {
  beforeEach(() => { process.env.NODE_ENV = "production"; });

  describe("1. COM STRIPE_SECRET_KEY: webhook secret e as duas URLs são obrigatórias", () => {
    it("tudo definido e https → passa, sem aviso", () => {
      setStripe();
      expect(() => assertStripeForBoot()).not.toThrow();
      expect(billingWarnings()).toEqual([]);
      expect(stripeProductionProblems()).toEqual([]);
    });

    it.each(["STRIPE_WEBHOOK_SECRET", ...STRIPE_URL_VARS] as const)("faltando SÓ %s → o boot FALHA, dizendo exatamente qual falta (e nenhum valor aparece)", (missing) => {
      setStripe({ [missing]: null });
      expect(stripeProductionProblems().map((p) => p.name)).toEqual([missing]);
      const msg = messageOf(() => assertStripeForBoot());
      expect(msg).toMatch(/\[billing\] Stripe inválido em produção/);
      expect(msg).toContain(`${missing} não está definida`);
      expect(msg).toMatch(/a API NÃO sobe/);
      noValueLeaked(msg);
    });

    it("nenhuma das três → FALHA listando as três", () => {
      setStripe({ STRIPE_WEBHOOK_SECRET: null, STRIPE_SUCCESS_URL: null, STRIPE_CANCEL_URL: null });
      const msg = messageOf(() => assertStripeForBoot());
      for (const k of ["STRIPE_WEBHOOK_SECRET", ...STRIPE_URL_VARS]) expect(msg).toContain(`${k} não está definida`);
      noValueLeaked(msg);
    });

    it("segredo do webhook em branco/só espaço equivale a FALTAR", () => {
      setStripe({ STRIPE_WEBHOOK_SECRET: "   " });
      expect(messageOf(() => assertStripeForBoot())).toContain("STRIPE_WEBHOOK_SECRET não está definida");
      setStripe({ STRIPE_WEBHOOK_SECRET: "" });
      expect(messageOf(() => assertStripeForBoot())).toContain("STRIPE_WEBHOOK_SECRET não está definida");
    });

    it("chave só com espaço conta como ATIVA (o provider a usaria) → exige o resto", () => {
      setStripe({ STRIPE_SECRET_KEY: "   ", STRIPE_WEBHOOK_SECRET: null });
      expect(messageOf(() => assertStripeForBoot())).toContain("STRIPE_WEBHOOK_SECRET");
    });
  });

  describe("2. as duas URLs: https e nunca localhost", () => {
    it.each(STRIPE_URL_VARS)("%s com http → FALHA (não usa https)", (name) => {
      setStripe({ [name]: "http://valorsecreto.genbreed.com.br/app" });
      const msg = messageOf(() => assertStripeForBoot());
      expect(msg).toContain(`${name} não usa https`);
      noValueLeaked(msg);
    });

    it.each(STRIPE_URL_VARS)("%s apontando para localhost → FALHA, mesmo com https", (name) => {
      setStripe({ [name]: "https://localhost:3000/valorsecreto" });
      const msg = messageOf(() => assertStripeForBoot());
      expect(msg).toContain(`${name} aponta para localhost`);
      noValueLeaked(msg);
    });

    it("o padrão de dev (http://localhost:3000/…) copiado para o Railway → FALHA nas duas, dizendo quais", () => {
      setStripe({
        STRIPE_SUCCESS_URL: "http://localhost:3000/app/profile?billing=success&session_id={CHECKOUT_SESSION_ID}",
        STRIPE_CANCEL_URL: "http://localhost:3000/app/profile?billing=cancel",
      });
      const msg = messageOf(() => assertStripeForBoot());
      expect(msg).toContain("STRIPE_SUCCESS_URL aponta para localhost");
      expect(msg).toContain("STRIPE_CANCEL_URL aponta para localhost");
      expect(msg).not.toContain("3000");
    });

    it("URL com espaço/quebra de linha ou que não é URL → FALHA", () => {
      setStripe({ STRIPE_SUCCESS_URL: "https://genbreed.com.br/app\n" });
      expect(messageOf(() => assertStripeForBoot())).toContain("STRIPE_SUCCESS_URL tem espaço ou quebra de linha");
      setStripe({ STRIPE_CANCEL_URL: "valorsecreto" });
      const msg = messageOf(() => assertStripeForBoot());
      expect(msg).toContain("STRIPE_CANCEL_URL não é uma URL válida");
      noValueLeaked(msg);
    });

    it("problemas do webhook e das URLs aparecem JUNTOS numa só mensagem", () => {
      setStripe({ STRIPE_WEBHOOK_SECRET: null, STRIPE_CANCEL_URL: "http://genbreed.com.br/x" });
      const msg = messageOf(() => assertStripeForBoot());
      expect(msg).toContain("STRIPE_WEBHOOK_SECRET não está definida");
      expect(msg).toContain("STRIPE_CANCEL_URL não usa https");
    });
  });

  describe("3. SEM STRIPE_SECRET_KEY: passa (billing desligado), com aviso 1x por processo", () => {
    it("não lança e avisa uma única vez, mesmo chamando várias vezes", () => {
      expect(() => assertStripeForBoot()).not.toThrow();
      assertStripeForBoot(); assertStripeForBoot();
      expect(billingWarnings()).toHaveLength(1);
      const msg = String(billingWarnings()[0]![0]);
      expect(msg).toMatch(/billing DESLIGADO/);
      expect(msg).not.toMatch(/IGNORADA/);
    });

    it("chave em branco também é 'sem chave'", () => {
      setStripe({ STRIPE_SECRET_KEY: "" , STRIPE_WEBHOOK_SECRET: null, STRIPE_SUCCESS_URL: null, STRIPE_CANCEL_URL: null });
      expect(() => assertStripeForBoot()).not.toThrow();
      expect(billingWarnings()).toHaveLength(1);
    });

    it("com webhook/URLs definidos mas SEM a chave: passa, e o aviso diz que serão IGNORADOS (só nomes; a chave provavelmente sumiu)", () => {
      setStripe({ STRIPE_SECRET_KEY: null });
      expect(() => assertStripeForBoot()).not.toThrow();
      const msg = String(billingWarnings()[0]![0]);
      expect(msg).toMatch(/IGNORADA/);
      for (const k of ["STRIPE_WEBHOOK_SECRET", ...STRIPE_URL_VARS]) expect(msg).toContain(k);
      noValueLeaked(msg);
    });
  });
});

describe("4. FORA de produção nada falha — só avisa", () => {
  it.each(["test", "development", undefined])("NODE_ENV=%s: nunca lança, em nenhuma combinação", (env) => {
    if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
    const combos: Record<string, string | null>[] = [
      { STRIPE_SECRET_KEY: null, STRIPE_WEBHOOK_SECRET: null, STRIPE_SUCCESS_URL: null, STRIPE_CANCEL_URL: null },
      { STRIPE_WEBHOOK_SECRET: null }, { STRIPE_SUCCESS_URL: null }, { STRIPE_CANCEL_URL: "http://localhost:3000/x" },
      { STRIPE_SUCCESS_URL: "nao-e-url" }, {},
    ];
    for (const c of combos) { setStripe(c); expect(() => assertStripeForBoot(), JSON.stringify(Object.keys(c))).not.toThrow(); }
  });

  it("chave SEM segredo do webhook: avisa 1x por processo que os pagamentos não serão creditados (sem valores)", () => {
    process.env.NODE_ENV = "development";
    setStripe({ STRIPE_WEBHOOK_SECRET: null });
    assertStripeForBoot(); assertStripeForBoot();
    expect(billingWarnings()).toHaveLength(1);
    const msg = String(billingWarnings()[0]![0]);
    expect(msg).toMatch(/STRIPE_WEBHOOK_SECRET/);
    expect(msg).toMatch(/NÃO serão creditados/);
    noValueLeaked(msg);
  });

  it("silêncio quando não há o que avisar: sem chave (dev normal, stub); ou chave com webhook — URLs localhost/ausentes são o padrão de dev", () => {
    process.env.NODE_ENV = "development";
    setStripe({ STRIPE_SECRET_KEY: null });
    assertStripeForBoot();
    setStripe({ STRIPE_SUCCESS_URL: null, STRIPE_CANCEL_URL: "http://localhost:3000/app/profile?billing=cancel" });
    assertStripeForBoot();
    expect(billingWarnings()).toEqual([]);
  });
});

describe("boot da API (buildApp)", () => {
  const prodEnv = () => { process.env.NODE_ENV = "production"; process.env.AUTH_SECRET = STRONG_SECRET; process.env.DATABASE_URL = FAKE_DB; };

  it("PRODUÇÃO + chave sem segredo do webhook → o boot FALHA com a mensagem clara (antes de criar o app)", async () => {
    prodEnv();
    setStripe({ STRIPE_WEBHOOK_SECRET: null });
    let msg = "";
    await buildApp().catch((e: Error) => { msg = e.message; });
    expect(msg).toMatch(/\[billing\] Stripe inválido em produção/);
    expect(msg).toContain("STRIPE_WEBHOOK_SECRET não está definida");
    noValueLeaked(msg);
    expect(msg).not.toContain("senha-secreta");
  });

  it("PRODUÇÃO + URL de retorno para localhost → o boot FALHA", async () => {
    prodEnv();
    setStripe({ STRIPE_SUCCESS_URL: "http://localhost:3000/app/profile?billing=success" });
    await expect(buildApp()).rejects.toThrow(/STRIPE_SUCCESS_URL aponta para localhost/);
  });

  it("PRODUÇÃO + Stripe completo → sobe normal", async () => {
    prodEnv();
    setStripe();
    const app = await buildApp();
    try { await app.init(); expect(app).toBeDefined(); } finally { await app.close(); }
  });

  it("PRODUÇÃO sem STRIPE_SECRET_KEY → sobe (billing desligado), com o aviso", async () => {
    prodEnv();
    const app = await buildApp();
    try {
      await app.init();
      expect(billingWarnings().some((c) => /billing DESLIGADO/.test(String(c[0])))).toBe(true);
    } finally { await app.close(); }
  });

  it("FORA de produção com chave e sem webhook → sobe e avisa", async () => {
    process.env.NODE_ENV = "test";
    setStripe({ STRIPE_WEBHOOK_SECRET: null });
    const app = await buildApp();
    try {
      await app.init();
      expect(billingWarnings().some((c) => /NÃO serão creditados/.test(String(c[0])))).toBe(true);
    } finally { await app.close(); }
  });
});
