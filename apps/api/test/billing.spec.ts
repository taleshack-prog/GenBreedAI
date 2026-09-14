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

  it("pacotes: 10/50/100 com preços corretos", () => {
    const p = billing.packs();
    expect(p.map((x) => x.credits)).toEqual([10, 50, 100]);
    expect(p.find((x) => x.id === "pack-50")!.priceBRL).toBe(20);
  });

  it("checkout → confirm credita os créditos", async () => {
    const intent = await billing.createCheckout("u", "pack-50");
    expect(intent.status).toBe("PENDING");
    const r = await billing.confirm("u", intent.id);
    expect(r.status).toBe("PAID");
    expect(r.creditsAdded).toBe(50);
    expect((await wallet.get("u")).imageCredits).toBe(50);
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
