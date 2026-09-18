import { describe, it, expect, beforeEach } from "vitest";
import { BillingService } from "../src/billing/billing.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { InMemoryPaymentIntentsRepository } from "../src/billing/payment-intents.repository";
import { InMemorySubscriptionsRepository } from "../src/billing/subscriptions.repository";

describe("Compra de créditos (billing)", () => {
  let billing: BillingService; let wallet: WalletService;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.STRIPE_SECRET_KEY; // garante StubPaymentProvider no teste
    wallet = new WalletService(new InMemoryWalletRepository());
    billing = new BillingService(wallet, new InMemoryPaymentIntentsRepository(), new InMemorySubscriptionsRepository());
  });

  it("pacotes: 10/30/60 com id, preço e stripeLookupKey corretos (catálogo _v2 — pack-50/pack-100 saíram)", () => {
    const p = billing.packs();
    expect(p).toEqual([
      { id: "pack-10", credits: 10, priceBRL: 5.9, label: "10 créditos", stripeLookupKey: "pack_10_v2" },
      { id: "pack-30", credits: 30, priceBRL: 14.9, label: "30 créditos", stripeLookupKey: "pack_30_v2" },
      { id: "pack-60", credits: 60, priceBRL: 29.9, label: "60 créditos", stripeLookupKey: "pack_60_v2" },
    ]);
    expect(p.find((x) => x.id === "pack-50")).toBeUndefined();
    expect(p.find((x) => x.id === "pack-100")).toBeUndefined();
    expect(p.some((x) => x.stripeLookupKey === "pack_10" || x.stripeLookupKey === "pack_50" || x.stripeLookupKey === "pack_100")).toBe(false);
  });

  it("checkout → confirm credita os créditos", async () => {
    const intent = await billing.createCheckout("u", "pack-60");
    expect(intent.status).toBe("PENDING");
    const r = await billing.confirm("u", intent.id);
    expect(r.status).toBe("PAID");
    expect(r.creditsAdded).toBe(60);
    expect((await wallet.get("u")).imageCredits).toBe(60);
  });

  it("idempotente: confirmar 2x não credita em dobro", async () => {
    const intent = await billing.createCheckout("u", "pack-10");
    await billing.confirm("u", intent.id);
    const again = await billing.confirm("u", intent.id);
    expect(again.creditsAdded).toBe(0);
    expect((await wallet.get("u")).imageCredits).toBe(10);
  });

  it("pacote inválido é rejeitado", async () => {
    await expect(billing.createCheckout("u", "pack-x")).rejects.toThrow(/inválido/);
  });

  it("subscribe sem Stripe configurado é rejeitado", async () => {
    await expect(billing.subscribe("u", "SENIOR", "MONTH")).rejects.toThrow(/Stripe/);
  });

  it("subscribe com tier inválido (FREE não é assinável) é rejeitado", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake"; // resolvePaymentProvider() roda no construtor
    const b = new BillingService(wallet, new InMemoryPaymentIntentsRepository(), new InMemorySubscriptionsRepository());
    await expect(b.subscribe("u", "FREE", "MONTH")).rejects.toThrow(/[Tt]ier/);
  });

  it("subscribe com intervalo inválido é rejeitado", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    const b = new BillingService(wallet, new InMemoryPaymentIntentsRepository(), new InMemorySubscriptionsRepository());
    await expect(b.subscribe("u", "SENIOR", "WEEK" as never)).rejects.toThrow(/[Ii]ntervalo/);
  });

  it("getSubscription: null quando o usuário nunca assinou", async () => {
    expect(await billing.getSubscription("nunca-assinou")).toBeNull();
  });

  it("getSubscription: reflete a assinatura mais recente", async () => {
    const subs = new InMemorySubscriptionsRepository();
    const b = new BillingService(wallet, new InMemoryPaymentIntentsRepository(), subs);
    await subs.create({ id: "sub_1", userId: "u", tier: "PHD", interval: "YEAR", stripeCustomerId: "cus_1", status: "ACTIVE", currentPeriodEnd: new Date("2027-01-01T00:00:00Z"), cancelAtPeriodEnd: true });
    expect(await b.getSubscription("u")).toEqual({ tier: "PHD", interval: "YEAR", status: "ACTIVE", currentPeriodEnd: "2027-01-01T00:00:00.000Z", cancelAtPeriodEnd: true });
  });
});
