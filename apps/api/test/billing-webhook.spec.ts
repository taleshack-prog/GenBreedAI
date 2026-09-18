import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import Stripe from "stripe";
import { BillingService } from "../src/billing/billing.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { InMemoryPaymentIntentsRepository } from "../src/billing/payment-intents.repository";
import { InMemorySubscriptionsRepository } from "../src/billing/subscriptions.repository";
import { StripePaymentProvider } from "../src/billing/payment.provider";
import { makeReferralStack } from "./helpers/referral";

const WEBHOOK_SECRET = "whsec_test_123";

/** Assina o payload como o Stripe faria — só pra teste (SDK expõe isso). */
function sign(body: unknown): { rawBody: Buffer; signature: string } {
  const payload = JSON.stringify(body);
  const signature = new Stripe("sk_test_fake").webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { rawBody: Buffer.from(payload), signature };
}

function checkoutCompletedEvent(sessionOverrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        object: "checkout.session",
        payment_status: "paid",
        client_reference_id: "alice",
        metadata: { userId: "alice", packId: "pack-30" },
        amount_total: 1490,
        ...sessionOverrides,
      },
    },
  };
}

describe("Webhook Stripe (billing) — POST /billing/webhook", () => {
  let billing: BillingService; let wallet: WalletService; let subs: InMemorySubscriptionsRepository;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    wallet = new WalletService(new InMemoryWalletRepository());
    subs = new InMemorySubscriptionsRepository();
    billing = new BillingService(wallet, new InMemoryPaymentIntentsRepository(), subs, makeReferralStack(wallet, subs).referral);
  });

  it("credita ao receber checkout.session.completed pago", async () => {
    const { rawBody, signature } = sign(checkoutCompletedEvent());
    const r = await billing.handleWebhook(rawBody, signature);
    expect(r).toEqual({ received: true });
    expect((await wallet.get("alice")).imageCredits).toBe(30);
  });

  it("idempotente: reenvio do mesmo evento (retry do Stripe) não credita 2x", async () => {
    const { rawBody, signature } = sign(checkoutCompletedEvent());
    await billing.handleWebhook(rawBody, signature);
    await billing.handleWebhook(Buffer.from(rawBody), signature); // reenvio idêntico
    expect((await wallet.get("alice")).imageCredits).toBe(30);
  });

  it("assinatura inválida → BadRequestException (400)", async () => {
    const payload = JSON.stringify(checkoutCompletedEvent());
    await expect(billing.handleWebhook(Buffer.from(payload), "t=1,v1=deadbeef")).rejects.toThrow(/[Aa]ssinatura/);
  });

  it("ignora silenciosamente eventos que não interessam (200, sem crédito)", async () => {
    const { rawBody, signature } = sign({ id: "evt_2", object: "event", type: "payment_intent.created", data: { object: {} } });
    const r = await billing.handleWebhook(rawBody, signature);
    expect(r).toEqual({ received: true });
  });

  it("nunca credita por e-mail: sem client_reference_id, não credita ninguém", async () => {
    const { rawBody, signature } = sign(checkoutCompletedEvent({ client_reference_id: null, customer_details: { email: "bob@fora-da-conta.com" } }));
    await billing.handleWebhook(rawBody, signature);
    expect((await wallet.get("bob@fora-da-conta.com")).imageCredits ?? 0).toBe(0);
    expect((await wallet.get("alice")).imageCredits ?? 0).toBe(0);
  });

  it("sem STRIPE_WEBHOOK_SECRET → BadRequestException", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { rawBody, signature } = sign(checkoutCompletedEvent());
    await expect(billing.handleWebhook(rawBody, signature)).rejects.toThrow();
  });
});

/** Assinatura Stripe (SDK 2025+): current_period_end mora no item, não no topo. */
function fakeStripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_abc",
    object: "subscription",
    status: "active",
    cancel_at_period_end: false,
    items: { object: "list", data: [{ id: "si_1", current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
    ...overrides,
  };
}

function subscriptionCheckoutEvent(sessionOverrides: Record<string, unknown> = {}) {
  return {
    id: "evt_sub_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_sub_1",
        object: "checkout.session",
        mode: "subscription",
        client_reference_id: "alice",
        metadata: { userId: "alice", tier: "SENIOR", interval: "MONTH" },
        customer: "cus_abc",
        subscription: "sub_abc",
        ...sessionOverrides,
      },
    },
  };
}

describe("Webhook Stripe (billing) — ciclo de vida de assinatura", () => {
  let billing: BillingService; let subs: InMemorySubscriptionsRepository;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const wallet = new WalletService(new InMemoryWalletRepository());
    subs = new InMemorySubscriptionsRepository();
    billing = new BillingService(wallet, new InMemoryPaymentIntentsRepository(), subs, makeReferralStack(wallet, subs).referral);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("checkout.session.completed (mode=subscription) cria a linha em subscriptions", async () => {
    vi.spyOn(StripePaymentProvider.prototype, "retrieveSubscription").mockResolvedValue(fakeStripeSubscription() as any);
    const { rawBody, signature } = sign(subscriptionCheckoutEvent());
    await billing.handleWebhook(rawBody, signature);

    const row = await subs.findLatestForUser("alice");
    expect(row).toMatchObject({ id: "sub_abc", userId: "alice", tier: "SENIOR", interval: "MONTH", stripeCustomerId: "cus_abc", status: "ACTIVE", cancelAtPeriodEnd: false });
  });

  it("identifica o usuário por client_reference_id, nunca pelo e-mail do cliente", async () => {
    vi.spyOn(StripePaymentProvider.prototype, "retrieveSubscription").mockResolvedValue(fakeStripeSubscription() as any);
    const { rawBody, signature } = sign(subscriptionCheckoutEvent({ client_reference_id: null, customer_details: { email: "outra-conta@example.com" } }));
    await billing.handleWebhook(rawBody, signature);
    expect(await subs.findLatestForUser("alice")).toBeNull();
    expect(await subs.findLatestForUser("outra-conta@example.com")).toBeNull();
  });

  it("customer.subscription.updated atualiza status, período e cancel_at_period_end (upgrade/downgrade/cancelamento agendado)", async () => {
    await subs.create({ id: "sub_abc", userId: "alice", tier: "SENIOR", interval: "MONTH", stripeCustomerId: "cus_abc", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 1000), cancelAtPeriodEnd: false });
    const event = {
      id: "evt_upd", object: "event", type: "customer.subscription.updated",
      data: { object: fakeStripeSubscription({ status: "past_due", cancel_at_period_end: true }) },
    };
    const { rawBody, signature } = sign(event);
    await billing.handleWebhook(rawBody, signature);

    const row = await subs.findLatestForUser("alice");
    expect(row).toMatchObject({ status: "PAST_DUE", cancelAtPeriodEnd: true });
    // tier NÃO muda por esse evento (troca de Price é coisa do portal, fora de escopo).
    expect(row?.tier).toBe("SENIOR");
  });

  it("customer.subscription.deleted marca CANCELED", async () => {
    await subs.create({ id: "sub_abc", userId: "alice", tier: "PHD", interval: "YEAR", stripeCustomerId: "cus_abc", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 1000), cancelAtPeriodEnd: false });
    const event = { id: "evt_del", object: "event", type: "customer.subscription.deleted", data: { object: fakeStripeSubscription() } };
    const { rawBody, signature } = sign(event);
    await billing.handleWebhook(rawBody, signature);
    expect((await subs.findLatestForUser("alice"))?.status).toBe("CANCELED");
  });

  it("invoice.payment_failed marca PAST_DUE", async () => {
    await subs.create({ id: "sub_abc", userId: "alice", tier: "JUNIOR", interval: "MONTH", stripeCustomerId: "cus_abc", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 1000), cancelAtPeriodEnd: false });
    const event = {
      id: "evt_inv", object: "event", type: "invoice.payment_failed",
      data: { object: { id: "in_1", object: "invoice", parent: { subscription_details: { subscription: "sub_abc" } } } },
    };
    const { rawBody, signature } = sign(event);
    await billing.handleWebhook(rawBody, signature);
    expect((await subs.findLatestForUser("alice"))?.status).toBe("PAST_DUE");
  });
});
