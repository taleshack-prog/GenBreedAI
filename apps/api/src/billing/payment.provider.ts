/**
 * Provedor de pagamento ABSTRATO. StubPaymentProvider (aprova na hora, para
 * testar o fluxo) e StripePaymentProvider (Checkout Session real) implementam
 * a mesma interface — trocados em resolvePaymentProvider() sem mexer no resto.
 */
import Stripe from "stripe";
import { findPack } from "./credit-packs";
import type { PaymentIntentsRepository } from "./payment-intents.repository";

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
 * Gateway real (Checkout Session). Só o fluxo de pack avulso (mode=payment)
 * está implementado aqui — assinaturas e o webhook ficam para depois; por
 * ora `confirm()` é chamado sob demanda (poll) pelo cliente.
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

    // /profile é onde a UI de compra de créditos vive — não há página dedicada
    // de retorno ainda, então volta pra lá com um marcador de resultado.
    const successUrl = process.env.STRIPE_SUCCESS_URL ?? "http://localhost:3000/profile?billing=success&session_id={CHECKOUT_SESSION_ID}";
    const cancelUrl = process.env.STRIPE_CANCEL_URL ?? "http://localhost:3000/profile?billing=cancel";

    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: userId,
      metadata: { userId, packId },
      success_url: successUrl,
      cancel_url: cancelUrl,
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
}

export function resolvePaymentProvider(intents: PaymentIntentsRepository): PaymentProvider {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) return new StripePaymentProvider(stripeKey, intents);
  return new StubPaymentProvider();
}
