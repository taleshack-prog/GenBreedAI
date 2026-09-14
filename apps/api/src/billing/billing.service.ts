/**
 * Compra de créditos de imagem. Fluxo: createCheckout (cria cobrança) →
 * confirm (paga; no gateway real vem por webhook) → credita a carteira.
 * Anti-fraude: só credita 1x por intent (idempotente, via payment_intents —
 * ver PaymentIntentsRepository.claimCredit).
 */
import { BadRequestException, Injectable } from "@nestjs/common";
import { findPack, CREDIT_PACKS } from "./credit-packs";
import { resolvePaymentProvider, type PaymentIntent, type PaymentProvider } from "./payment.provider";
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
}
