/**
 * Provedor de pagamento ABSTRATO. Hoje: StubPaymentProvider (aprova na hora,
 * para testar o fluxo). Amanhã: implementar PixPaymentProvider / StripePaymentProvider
 * com a mesma interface e trocar em resolvePaymentProvider() — sem mexer no resto.
 */
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
 * TODO(gateway): implementar e retornar aqui conforme env.
 *   if (process.env.STRIPE_SECRET_KEY) return new StripePaymentProvider(...);
 *   if (process.env.PIX_PROVIDER_KEY) return new PixPaymentProvider(...);
 */
export function resolvePaymentProvider(): PaymentProvider {
  return new StubPaymentProvider();
}
