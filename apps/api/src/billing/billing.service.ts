/**
 * Compra de créditos de imagem. Fluxo: createCheckout (cria cobrança) →
 * confirm (paga; no gateway real vem por webhook) → credita a carteira.
 * Anti-fraude: só credita 1x por intent (idempotente).
 */
import { BadRequestException, Injectable } from "@nestjs/common";
import { findPack, CREDIT_PACKS } from "./credit-packs";
import { resolvePaymentProvider, type PaymentIntent } from "./payment.provider";
import { WalletService } from "../economy/wallet.service";

@Injectable()
export class BillingService {
  private readonly payments = resolvePaymentProvider();
  private readonly credited = new Set<string>(); // intents já creditadas (idempotência)
  constructor(private readonly wallet: WalletService) {}

  packs() { return CREDIT_PACKS; }

  async createCheckout(userId: string, packId: string): Promise<PaymentIntent> {
    const pack = findPack(packId);
    if (!pack) throw new BadRequestException("Pacote inválido.");
    return this.payments.createIntent(userId, packId, pack.priceBRL);
  }

  /** Confirma o pagamento e credita os créditos (idempotente por intent). */
  async confirm(userId: string, intentId: string): Promise<{ status: string; creditsAdded: number; wallet: unknown }> {
    const intent = await this.payments.confirm(intentId);
    if (intent.status !== "PAID") return { status: intent.status, creditsAdded: 0, wallet: await this.wallet.get(userId) };
    if (this.credited.has(intentId)) return { status: "PAID", creditsAdded: 0, wallet: await this.wallet.get(userId) };
    const pack = findPack(intent.packId);
    if (!pack) throw new BadRequestException("Pacote inválido.");
    this.credited.add(intentId);
    const wallet = await this.wallet.creditImageCredits(userId, pack.credits);
    return { status: "PAID", creditsAdded: pack.credits, wallet };
  }
}
