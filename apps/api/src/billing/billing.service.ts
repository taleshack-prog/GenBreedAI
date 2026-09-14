/**
 * Compra de créditos de imagem. Fluxo: createCheckout (cria cobrança) →
 * confirm (paga; no gateway real vem por webhook) → credita a carteira.
 * Anti-fraude: só credita 1x por intent (idempotente, via payment_intents —
 * ver PaymentIntentsRepository.claimCredit).
 */
import { BadRequestException, Injectable } from "@nestjs/common";
import type Stripe from "stripe";
import { findPack, CREDIT_PACKS } from "./credit-packs";
import { resolvePaymentProvider, StripePaymentProvider, type PaymentIntent, type PaymentProvider } from "./payment.provider";
import { PaymentIntentsRepository } from "./payment-intents.repository";
import { WalletService } from "../economy/wallet.service";

@Injectable()
export class BillingService {
  private readonly payments: PaymentProvider;
  constructor(private readonly wallet: WalletService, private readonly intents: PaymentIntentsRepository) {
    this.payments = resolvePaymentProvider(intents);
  }

  packs() { return CREDIT_PACKS; }

  async createCheckout(userId: string, packId: string): Promise<PaymentIntent> {
    const pack = findPack(packId);
    if (!pack) throw new BadRequestException("Pacote inválido.");
    return this.payments.createIntent(userId, packId, pack.priceBRL);
  }

  /**
   * Confirma o pagamento e credita os créditos. Idempotente por intent via
   * `claimCredit`: um UPDATE condicional (`credited_at IS NULL`) garante 1
   * crédito mesmo sob retries de webhook (Stripe reenvia por até 3 dias) ou
   * restart do container — diferente do antigo `Set` em memória, que zerava
   * a cada deploy e permitia crédito duplicado.
   */
  async confirm(userId: string, intentId: string): Promise<{ status: string; creditsAdded: number; wallet: unknown }> {
    const intent = await this.payments.confirm(intentId);
    if (intent.status !== "PAID") return { status: intent.status, creditsAdded: 0, wallet: await this.wallet.get(userId) };
    const pack = findPack(intent.packId);
    if (!pack) throw new BadRequestException("Pacote inválido.");
    const won = await this.intents.claimCredit({ id: intentId, userId, kind: "PACK", packId: intent.packId, amountBRL: intent.amountBRL });
    if (!won) return { status: "PAID", creditsAdded: 0, wallet: await this.wallet.get(userId) };
    const wallet = await this.wallet.creditImageCredits(userId, pack.credits);
    return { status: "PAID", creditsAdded: pack.credits, wallet };
  }

  /**
   * POST /billing/webhook. Autenticidade vem da assinatura Stripe (nunca de
   * JWT — o Stripe não tem sessão de usuário). Verifica com o corpo BRUTO;
   * lança BadRequestException (→ 400) se a assinatura não bater ou o
   * webhook não estiver configurado. Eventos que não interessam recebem 200
   * silencioso — só checkout.session.completed credita.
   */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ received: true }> {
    if (!(this.payments instanceof StripePaymentProvider)) throw new BadRequestException("Webhook Stripe não configurado (STRIPE_SECRET_KEY ausente).");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new BadRequestException("STRIPE_WEBHOOK_SECRET ausente.");
    if (!signature) throw new BadRequestException("Assinatura Stripe ausente.");

    let event: Stripe.Event;
    try {
      event = this.payments.constructWebhookEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      throw new BadRequestException(`Assinatura Stripe inválida: ${(err as Error).message}`);
    }

    if (event.type === "checkout.session.completed") {
      await this.creditFromCheckoutSession(event.data.object as Stripe.Checkout.Session);
    }
    // Qualquer outro tipo de evento: 200 silencioso (não é nosso fluxo).
    return { received: true };
  }

  /** Credita a partir de uma Checkout Session paga — responde rápido (só DB), sem chamadas externas. */
  private async creditFromCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
    if (session.payment_status !== "paid") return;
    // client_reference_id, NUNCA o e-mail do cliente: o e-mail é digitado no
    // checkout e pode ser de outra conta — client_reference_id vem de quem
    // criou a sessão autenticado (StripePaymentProvider.createIntent).
    const userId = session.client_reference_id;
    const packId = session.metadata?.packId;
    if (!userId || !packId) return; // sessão fora do nosso fluxo (ex.: criada fora do app)
    const pack = findPack(packId);
    if (!pack) return;
    const amountBRL = (session.amount_total ?? 0) / 100;
    const won = await this.intents.claimCredit({ id: session.id, userId, kind: "PACK", packId, amountBRL });
    if (won) await this.wallet.creditImageCredits(userId, pack.credits);
  }
}
