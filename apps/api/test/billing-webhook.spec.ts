import { describe, it, expect, beforeEach } from "vitest";
import Stripe from "stripe";
import { BillingService } from "../src/billing/billing.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { InMemoryPaymentIntentsRepository } from "../src/billing/payment-intents.repository";

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
        metadata: { userId: "alice", packId: "pack-50" },
        amount_total: 2000,
        ...sessionOverrides,
      },
    },
  };
}

describe("Webhook Stripe (billing) — POST /billing/webhook", () => {
  let billing: BillingService; let wallet: WalletService;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    wallet = new WalletService(new InMemoryWalletRepository());
    billing = new BillingService(wallet, new InMemoryPaymentIntentsRepository());
  });

  it("credita ao receber checkout.session.completed pago", async () => {
    const { rawBody, signature } = sign(checkoutCompletedEvent());
    const r = await billing.handleWebhook(rawBody, signature);
    expect(r).toEqual({ received: true });
    expect((await wallet.get("alice")).imageCredits).toBe(50);
  });

  it("idempotente: reenvio do mesmo evento (retry do Stripe) não credita 2x", async () => {
    const { rawBody, signature } = sign(checkoutCompletedEvent());
    await billing.handleWebhook(rawBody, signature);
    await billing.handleWebhook(Buffer.from(rawBody), signature); // reenvio idêntico
    expect((await wallet.get("alice")).imageCredits).toBe(50);
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
