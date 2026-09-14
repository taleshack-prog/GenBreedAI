/**
 * Provedor de pagamento ABSTRATO. StubPaymentProvider (aprova na hora, para
 * testar o fluxo) e StripePaymentProvider (Checkout Session real) implementam
 * a mesma interface — trocados em resolvePaymentProvider() sem mexer no resto.
 */
import Stripe from "stripe";
import type { Tier } from "@genbreedai/shared";
import { findPack } from "./credit-packs";
import type { PaymentIntentsRepository } from "./payment-intents.repository";
import { subscriptionLookupKey, type SubscriptionInterval } from "./subscription-plans";

export interface PaymentIntent { id: string; status: "PENDING" | "PAID" | "FAILED"; amountBRL: number; packId: string; checkoutUrl?: string; }

export abstract class PaymentProvider {
  /** Cria a cobrança. Num gateway real, retornaria checkoutUrl/QR do Pix. */
  abstract createIntent(userId: string, packId: string, amountBRL: number): Promise<PaymentIntent>;
  /** Confirma o pagamento (webhook no gateway real; imediato no stub). */
  abstract confirm(intentId: string): Promise<PaymentIntent>;
}

/** STUB de desenvolvimento: cria e aprova imediatamente. NÃO usar em produção. */
export class StubPaymentProvider extends PaymentProvider {
  private intents = new Map<string, PaymentIntent>();
  async createIntent(userId: string, packId: string, amountBRL: number): Promise<PaymentIntent> {
    const id = `pi_stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const intent: PaymentIntent = { id, status: "PENDING", amountBRL, packId };
    this.intents.set(id, intent);
    return intent;
  }
  async confirm(intentId: string): Promise<PaymentIntent> {
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error("Intent não encontrada.");
    intent.status = "PAID"; // stub aprova sempre
    return intent;
  }
}

/**
 * Gateway real (Checkout Session). Cobre pack avulso (mode=payment) e
 * assinatura (mode=subscription). `confirm()` segue disponível para poll
 * sob demanda do pack; o crédito/ciclo de vida confiável vem do webhook
 * (POST /billing/webhook → BillingService.handleWebhook), que usa
 * `constructWebhookEvent` abaixo pra verificar a assinatura.
 */
export class StripePaymentProvider extends PaymentProvider {
  private readonly stripe: Stripe;
  constructor(secretKey: string, private readonly intents: PaymentIntentsRepository) {
    super();
    this.stripe = new Stripe(secretKey);
  }

  async createIntent(userId: string, packId: string, amountBRL: number): Promise<PaymentIntent> {
    const pack = findPack(packId);
    if (!pack) throw new Error(`Pacote inválido: ${packId}`);

    // Resolve o Price pelo lookup_key — NUNCA hardcode price_id (muda entre
    // sandbox e produção).
    const prices = await this.stripe.prices.list({ lookup_keys: [pack.stripeLookupKey], active: true });
    const price = prices.data[0];
    if (!price) throw new Error(`Preço Stripe não encontrado para lookup_key=${pack.stripeLookupKey}`);
    if (price.currency !== "brl") throw new Error(`Price ${price.id} (lookup_key=${pack.stripeLookupKey}) não está em BRL.`);

    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: userId,
      metadata: { userId, packId },
      success_url: this.successUrl(),
      cancel_url: this.cancelUrl(),
    });

    // Persiste PENDING antes de retornar: se o processo cair logo em
    // seguida, a linha já existe para o confirm()/webhook futuro encontrar.
    await this.intents.insertPending({ id: session.id, userId, kind: "PACK", packId, amountBRL });

    return { id: session.id, status: "PENDING", amountBRL, packId, checkoutUrl: session.url ?? undefined };
  }

  /** Consulta a sessão no Stripe e reflete o estado real. NUNCA aprova por conta própria. */
  async confirm(intentId: string): Promise<PaymentIntent> {
    const session = await this.stripe.checkout.sessions.retrieve(intentId);
    const packId = session.metadata?.packId ?? "";
    const amountBRL = (session.amount_total ?? 0) / 100;
    const status: PaymentIntent["status"] =
      session.payment_status === "paid" ? "PAID"
      : session.status === "expired" ? "FAILED"
      : "PENDING";
    return { id: session.id, status, amountBRL, packId, checkoutUrl: session.url ?? undefined };
  }

  /**
   * Verifica a assinatura Stripe do corpo BRUTO do webhook e retorna o
   * evento já validado. Lança se a assinatura não bater — quem chama decide
   * o 400 (nunca confia no payload sem essa verificação).
   */
  constructWebhookEvent(rawBody: Buffer, signature: string, webhookSecret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  // /profile é onde a UI de billing vive — não há página dedicada de
  // retorno ainda, então volta pra lá com um marcador de resultado.
  private successUrl(): string { return process.env.STRIPE_SUCCESS_URL ?? "http://localhost:3000/profile?billing=success&session_id={CHECKOUT_SESSION_ID}"; }
  private cancelUrl(): string { return process.env.STRIPE_CANCEL_URL ?? "http://localhost:3000/profile?billing=cancel"; }

  /**
   * Cria a Checkout Session de assinatura (mode=subscription). Reusa o
   * Customer existente do usuário quando houver — Customers duplicados
   * quebram o portal de gerenciamento do cliente (fora do escopo aqui, mas
   * é dele que essa duplicação atrapalharia).
   */
  async createSubscriptionCheckout(userId: string, tier: Tier, interval: SubscriptionInterval, existingCustomerId: string | null): Promise<string> {
    const lookupKey = subscriptionLookupKey(tier, interval);
    if (!lookupKey) throw new Error(`Tier/intervalo inválido para assinatura: ${tier}/${interval}.`);

    const prices = await this.stripe.prices.list({ lookup_keys: [lookupKey], active: true });
    const price = prices.data[0];
    if (!price) throw new Error(`Preço Stripe não encontrado para lookup_key=${lookupKey}`);
    if (price.currency !== "brl") throw new Error(`Price ${price.id} (lookup_key=${lookupKey}) não está em BRL.`);

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: userId,
      metadata: { userId, tier, interval },
      ...(existingCustomerId ? { customer: existingCustomerId } : {}),
      success_url: this.successUrl(),
      cancel_url: this.cancelUrl(),
    });
    if (!session.url) throw new Error("Stripe não retornou checkoutUrl para a assinatura.");
    return session.url;
  }

  /** Busca a Subscription completa (status, período) — checkout.session.completed só traz o id. */
  async retrieveSubscription(id: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(id);
  }
}

export function resolvePaymentProvider(intents: PaymentIntentsRepository): PaymentProvider {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) return new StripePaymentProvider(stripeKey, intents);
  return new StubPaymentProvider();
}
