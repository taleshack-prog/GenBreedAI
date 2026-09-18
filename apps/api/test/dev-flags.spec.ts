/**
 * Flags de DEV/TESTE (`common/dev-flags.ts`): em produção são SEMPRE
 * ignoradas, mesmo definidas como "true" — AUTH_DEV_HEADERS,
 * IMAGE_QUOTA_UNLIMITED, BILLING_STUB_ENABLED e QUOTA_UNLIMITED_DEV (+ alias
 * depreciado CROSS_QUOTA_UNLIMITED). Fora de produção seguem valendo como
 * antes. O comportamento de QUOTA_UNLIMITED_DEV em si continua coberto por
 * `quota-reservation.spec.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { isDevFlagEnabled, resetDevFlagWarnings } from "../src/common/dev-flags";
import { AuthGuard } from "../src/common/auth.guard";
import { TierService } from "../src/billing/tier.service";
import { InMemorySubscriptionsRepository } from "../src/billing/subscriptions.repository";
import { InMemoryGrantedTiersRepository } from "../src/billing/granted-tiers.repository";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { BillingController } from "../src/billing/billing.controller";
import { BillingService } from "../src/billing/billing.service";
import { InMemoryPaymentIntentsRepository } from "../src/billing/payment-intents.repository";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { makeReferralStack } from "./helpers/referral";

const ENV_KEYS = ["NODE_ENV", "AUTH_DEV_HEADERS", "IMAGE_QUOTA_UNLIMITED", "BILLING_STUB_ENABLED", "QUOTA_UNLIMITED_DEV", "CROSS_QUOTA_UNLIMITED", "STRIPE_SECRET_KEY", "DATABASE_URL"] as const;

let saved: Record<string, string | undefined>;
let warnSpy: MockInstance<typeof console.warn>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  resetDevFlagWarnings();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const ignoredWarnings = () => warnSpy.mock.calls.filter((c) => String(c[0]).includes("IGNORADA"));

describe("isDevFlagEnabled — a função única", () => {
  it("desligada por padrão; só a string exata 'true' liga (fora de produção)", () => {
    process.env.NODE_ENV = "test";
    expect(isDevFlagEnabled("AUTH_DEV_HEADERS")).toBe(false);
    process.env.AUTH_DEV_HEADERS = "false";
    expect(isDevFlagEnabled("AUTH_DEV_HEADERS")).toBe(false);
    process.env.AUTH_DEV_HEADERS = "1";
    expect(isDevFlagEnabled("AUTH_DEV_HEADERS")).toBe(false);
    process.env.AUTH_DEV_HEADERS = "true";
    expect(isDevFlagEnabled("AUTH_DEV_HEADERS")).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("sem NODE_ENV definido, a flag vale (só 'production' ignora)", () => {
    process.env.IMAGE_QUOTA_UNLIMITED = "true";
    expect(isDevFlagEnabled("IMAGE_QUOTA_UNLIMITED")).toBe(true);
  });

  it("NODE_ENV=production: IGNORADA mesmo 'true', com aviso 1x por processo POR flag (nunca silenciosa)", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_DEV_HEADERS = "true";
    process.env.BILLING_STUB_ENABLED = "true";
    for (let i = 0; i < 3; i++) {
      expect(isDevFlagEnabled("AUTH_DEV_HEADERS")).toBe(false);
      expect(isDevFlagEnabled("BILLING_STUB_ENABLED")).toBe(false);
    }
    expect(ignoredWarnings().length).toBe(2); // 1 por flag, não 1 por chamada
    expect(String(ignoredWarnings()[0]![0])).toContain("AUTH_DEV_HEADERS");
  });

  it("flag NÃO definida em produção não gera aviso nenhum", () => {
    process.env.NODE_ENV = "production";
    expect(isDevFlagEnabled("AUTH_DEV_HEADERS")).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("alias depreciado: vale fora de produção (aviso de depreciação 1x) e é ignorado em produção", () => {
    process.env.NODE_ENV = "test";
    process.env.CROSS_QUOTA_UNLIMITED = "true";
    const opts = { deprecatedAliases: ["CROSS_QUOTA_UNLIMITED"] } as const;
    expect(isDevFlagEnabled("QUOTA_UNLIMITED_DEV", opts)).toBe(true);
    expect(isDevFlagEnabled("QUOTA_UNLIMITED_DEV", opts)).toBe(true);
    expect(warnSpy.mock.calls.filter((c) => String(c[0]).includes("DEPRECIADA")).length).toBe(1);
    process.env.NODE_ENV = "production";
    expect(isDevFlagEnabled("QUOTA_UNLIMITED_DEV", opts)).toBe(false);
    expect(ignoredWarnings().length).toBe(1);
  });
});

describe("AUTH_DEV_HEADERS", () => {
  const ctxWith = (headers: Record<string, string>) => {
    const req: { headers: Record<string, string>; user?: { id: string; tier: string } } = { headers };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    return { ctx, req };
  };
  const DEV_HEADERS = { "x-user-id": "atacante", "x-user-tier": "PHD" };

  it("produção + flag ligada: o cabeçalho de dev é REJEITADO (401) — sem JWT não entra", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_DEV_HEADERS = "true";
    const { ctx, req } = ctxWith(DEV_HEADERS);
    expect(() => new AuthGuard().canActivate(ctx)).toThrow(UnauthorizedException);
    expect(req.user).toBeUndefined();
  });

  it("produção + flag ligada: x-user-tier NÃO promove ninguém a PhD (TierService continua FREE)", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_DEV_HEADERS = "true";
    const tiers = new TierService(new InMemorySubscriptionsRepository(), new InMemoryGrantedTiersRepository());
    expect(await tiers.resolve("atacante", "PHD")).toBe("FREE");
  });

  it("fora de produção + flag ligada: continua funcionando como hoje", async () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_DEV_HEADERS = "true";
    const { ctx, req } = ctxWith(DEV_HEADERS);
    expect(new AuthGuard().canActivate(ctx)).toBe(true);
    expect(req.user).toEqual({ id: "atacante", tier: "PHD" });
    const tiers = new TierService(new InMemorySubscriptionsRepository(), new InMemoryGrantedTiersRepository());
    expect(await tiers.resolve("atacante", "PHD")).toBe("PHD");
  });

  it("fora de produção SEM a flag: cabeçalho de dev também é rejeitado (como sempre)", () => {
    process.env.NODE_ENV = "test";
    const { ctx } = ctxWith(DEV_HEADERS);
    expect(() => new AuthGuard().canActivate(ctx)).toThrow(UnauthorizedException);
  });
});

describe("IMAGE_QUOTA_UNLIMITED", () => {
  it("produção + flag ligada: a cota mensal CONTINUA contando (FREE tem 0 retratos extras → nega)", async () => {
    process.env.NODE_ENV = "production";
    process.env.IMAGE_QUOTA_UNLIMITED = "true";
    const q = new ImageQuotaService();
    expect(await q.remaining("u", "FREE")).toBe(0);
    expect(await q.tryConsume("u", "FREE")).toBe(false);
  });

  it("produção + flag ligada: SENIOR (15/mês) esgota de verdade em 15 consumos", async () => {
    process.env.NODE_ENV = "production";
    process.env.IMAGE_QUOTA_UNLIMITED = "true";
    const q = new ImageQuotaService();
    for (let i = 0; i < 15; i++) expect(await q.tryConsume("u", "SENIOR")).toBe(true);
    expect(await q.tryConsume("u", "SENIOR")).toBe(false);
    expect(await q.remaining("u", "SENIOR")).toBe(0);
  });

  it("fora de produção + flag ligada: ilimitada, como hoje", async () => {
    process.env.NODE_ENV = "test";
    process.env.IMAGE_QUOTA_UNLIMITED = "true";
    const q = new ImageQuotaService();
    expect(await q.remaining("u", "FREE")).toBe(9999);
    expect(await q.tryConsume("u", "FREE")).toBe(true);
  });
});

describe("BILLING_STUB_ENABLED", () => {
  let wallet: WalletService; let controller: BillingController; let billing: BillingService;
  beforeEach(() => {
    wallet = new WalletService(new InMemoryWalletRepository());
    billing = new BillingService(wallet, new InMemoryPaymentIntentsRepository(), new InMemorySubscriptionsRepository(), makeReferralStack(wallet).referral);
    controller = new BillingController(billing);
  });
  const credits = async () => (await wallet.get("u")).imageCredits ?? 0;

  it("produção + flag ligada (sem Stripe → provider stub): /confirm é RECUSADO, nada é aprovado sem cobrar", async () => {
    process.env.NODE_ENV = "production";
    process.env.BILLING_STUB_ENABLED = "true";
    const intent = await billing.createCheckout("u", "pack-10");
    expect(() => controller.confirm({ id: "u", tier: "FREE" }, { intentId: intent.id })).toThrow(ForbiddenException);
    expect(await credits()).toBe(0);
  });

  it("fora de produção + flag ligada: o stub aprova e credita, como hoje (dev)", async () => {
    process.env.NODE_ENV = "test";
    process.env.BILLING_STUB_ENABLED = "true";
    const intent = await billing.createCheckout("u", "pack-10");
    const r = await controller.confirm({ id: "u", tier: "FREE" }, { intentId: intent.id });
    expect(r.creditsAdded).toBe(10);
    expect(await credits()).toBe(10);
  });

  it("fora de produção SEM a flag: /confirm segue recusado", async () => {
    process.env.NODE_ENV = "test";
    const intent = await billing.createCheckout("u", "pack-10");
    expect(() => controller.confirm({ id: "u", tier: "FREE" }, { intentId: intent.id })).toThrow(ForbiddenException);
  });
});
