/**
 * Marco "converteu" (ADR-0024) NO WEBHOOK DO STRIPE: quando a assinatura do
 * INDICADO fica ativa, o INDICADOR é recompensado conforme o plano assinado
 * (JUNIOR +15 créditos · SENIOR +30 · PHD 1 mês do plano do indicador via
 * granted_tiers). O vínculo assinante → indicador vem de `client_reference_id`
 * (nunca do e-mail) + a linha de `referral_referred` criada no cadastro.
 * Idempotente: reenvio do webhook e renovações não creditam de novo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Stripe from "stripe";
import { BillingService } from "../src/billing/billing.service";
import { StripePaymentProvider } from "../src/billing/payment.provider";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { InMemoryPaymentIntentsRepository } from "../src/billing/payment-intents.repository";
import { InMemorySubscriptionsRepository } from "../src/billing/subscriptions.repository";
import type { ReferralService } from "../src/referral/referral.service";
import type { TierService } from "../src/billing/tier.service";
import { makeReferralStack } from "./helpers/referral";

const WEBHOOK_SECRET = "whsec_ref_123";

function sign(body: unknown): { rawBody: Buffer; signature: string } {
  const payload = JSON.stringify(body);
  const signature = new Stripe("sk_test_fake").webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { rawBody: Buffer.from(payload), signature };
}

function checkoutEvent(userId: string, tier: "JUNIOR" | "SENIOR" | "PHD", subId = "sub_1", eventId = "evt_1") {
  return {
    id: eventId, object: "event", type: "checkout.session.completed",
    data: { object: {
      id: `cs_${subId}`, object: "checkout.session", mode: "subscription",
      client_reference_id: userId, metadata: { userId, tier, interval: "MONTH" },
      customer: `cus_${userId}`, subscription: subId,
    } },
  };
}

function stripeSub(status: string, id = "sub_1") {
  return {
    id, object: "subscription", status, cancel_at_period_end: false,
    items: { object: "list", data: [{ id: "si_1", current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
  };
}

function updatedEvent(status: string, subId = "sub_1", eventId = "evt_u") {
  return { id: eventId, object: "event", type: "customer.subscription.updated", data: { object: stripeSub(status, subId) } };
}

describe("Webhook Stripe — marco 'converteu' da indicação", () => {
  let billing: BillingService; let wallet: WalletService; let referral: ReferralService; let tiers: TierService;
  const deliver = (event: unknown) => { const { rawBody, signature } = sign(event); return billing.handleWebhook(rawBody, signature); };
  const credits = async (id: string) => (await wallet.get(id)).imageCredits ?? 0;

  /** alice (FREE) indicou bob; o cadastro de bob só GRAVOU o vínculo (não rendeu crédito nenhum). */
  async function invite(owner = "alice", referred = "bob") {
    const link = await referral.getOrCreateLink(owner);
    await referral.linkReferred(link.code, referred);
  }

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    wallet = new WalletService(new InMemoryWalletRepository());
    const subs = new InMemorySubscriptionsRepository();
    ({ referral, tiers } = makeReferralStack(wallet, subs));
    billing = new BillingService(wallet, new InMemoryPaymentIntentsRepository(), subs, referral);
  });
  afterEach(() => vi.restoreAllMocks());

  it("assinatura JUNIOR ativa → indicador ganha 15 créditos (o cadastro não rendeu nada antes)", async () => {
    await invite();
    expect(await credits("alice")).toBe(0);
    vi.spyOn(StripePaymentProvider.prototype, "retrieveSubscription").mockResolvedValue(stripeSub("active") as never);
    await deliver(checkoutEvent("bob", "JUNIOR"));
    expect(await credits("alice")).toBe(15);
    expect((await referral.getOrCreateLink("alice")).conversions).toBe(1);
  });

  it("assinatura SENIOR ativa → +30 créditos", async () => {
    await invite();
    vi.spyOn(StripePaymentProvider.prototype, "retrieveSubscription").mockResolvedValue(stripeSub("active") as never);
    await deliver(checkoutEvent("bob", "SENIOR"));
    expect(await credits("alice")).toBe(30);
  });

  it("assinatura PHD com indicador FREE → 1 mês de JUNIOR (granted_tiers), sem créditos", async () => {
    await invite();
    vi.spyOn(StripePaymentProvider.prototype, "retrieveSubscription").mockResolvedValue(stripeSub("active") as never);
    expect(await tiers.resolve("alice")).toBe("FREE");
    await deliver(checkoutEvent("bob", "PHD"));
    expect(await tiers.resolve("alice")).toBe("JUNIOR");
    expect(await credits("alice")).toBe(0); // PHD dá tier, não créditos
  });

  it("webhook REPETIDO (retry do Stripe) não credita de novo", async () => {
    await invite();
    vi.spyOn(StripePaymentProvider.prototype, "retrieveSubscription").mockResolvedValue(stripeSub("active") as never);
    await deliver(checkoutEvent("bob", "JUNIOR"));
    await deliver(checkoutEvent("bob", "JUNIOR")); // reenvio idêntico
    await deliver(checkoutEvent("bob", "JUNIOR", "sub_1", "evt_2")); // mesmo pagamento, outro id de evento
    expect(await credits("alice")).toBe(15);
    expect((await referral.getOrCreateLink("alice")).conversions).toBe(1);
  });

  it("assinante que NÃO veio de indicação: nada é creditado e o webhook responde normalmente", async () => {
    vi.spyOn(StripePaymentProvider.prototype, "retrieveSubscription").mockResolvedValue(stripeSub("active") as never);
    await expect(deliver(checkoutEvent("zeca", "SENIOR"))).resolves.toEqual({ received: true });
    expect(await credits("alice")).toBe(0);
  });

  it("assinatura que nasce NÃO ativa não credita; ao ficar `active` (customer.subscription.updated) credita UMA vez", async () => {
    await invite();
    vi.spyOn(StripePaymentProvider.prototype, "retrieveSubscription").mockResolvedValue(stripeSub("incomplete") as never);
    await deliver(checkoutEvent("bob", "SENIOR"));
    expect(await credits("alice")).toBe(0);

    await deliver(updatedEvent("active"));
    expect(await credits("alice")).toBe(30);
    await deliver(updatedEvent("active", "sub_1", "evt_renov")); // renovação
    expect(await credits("alice")).toBe(30);
  });

  it("`trialing` não rende recompensa (só o status cru `active` do Stripe)", async () => {
    await invite();
    vi.spyOn(StripePaymentProvider.prototype, "retrieveSubscription").mockResolvedValue(stripeSub("trialing") as never);
    await deliver(checkoutEvent("bob", "JUNIOR"));
    expect(await credits("alice")).toBe(0);
  });

  it("falha ao recompensar → o webhook FALHA (Stripe reenvia) e o reenvio credita", async () => {
    await invite();
    vi.spyOn(StripePaymentProvider.prototype, "retrieveSubscription").mockResolvedValue(stripeSub("active") as never);
    const spy = vi.spyOn(wallet, "creditImageCredits").mockRejectedValueOnce(new Error("db caiu"));
    await expect(deliver(checkoutEvent("bob", "JUNIOR"))).rejects.toThrow(/db caiu/);
    spy.mockRestore();
    await deliver(checkoutEvent("bob", "JUNIOR"));
    expect(await credits("alice")).toBe(15);
  });
});
