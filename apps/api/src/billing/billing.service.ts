/**
 * Compra de créditos de imagem (pack avulso) e assinaturas (recorrente).
 * Pack: createCheckout (cria cobrança) → confirm (paga; no gateway real vem
 * por webhook) → credita a carteira. Anti-fraude: só credita 1x por intent
 * (idempotente, via payment_intents — ver PaymentIntentsRepository.claimCredit).
 * Assinatura: subscribe (cria Checkout Session mode=subscription) → o ciclo
 * de vida inteiro (criação, renovação, cancelamento, falha de cobrança) é
 * tratado só pelo webhook, nunca por poll do cliente.
 */
import { BadRequestException, Injectable } from "@nestjs/common";
import type Stripe from "stripe";
import type { Tier } from "@genbreedai/shared";
import { findPack, CREDIT_PACKS } from "./credit-packs";
import { isPaidTier, type SubscriptionInterval } from "./subscription-plans";
import { resolvePaymentProvider, StripePaymentProvider, type PaymentIntent, type PaymentProvider } from "./payment.provider";
import { PaymentIntentsRepository } from "./payment-intents.repository";
import { SubscriptionsRepository, mapStripeSubscriptionStatus, type SubscriptionRow } from "./subscriptions.repository";
import { WalletService } from "../economy/wallet.service";

export interface SubscriptionView { tier: Tier; interval: SubscriptionInterval; status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; }

/**
 * SDK do Stripe (API 2025+): `current_period_end` saiu do objeto Subscription
 * e foi pro item (uma assinatura pode ter itens com ciclos diferentes). Como
 * cada assinatura nossa tem sempre 1 line_item, pegamos o primeiro.
 */
function subscriptionPeriodEnd(sub: Stripe.Subscription): Date {
  const item = sub.items.data[0];
  const unixSeconds = item?.current_period_end ?? Math.floor(Date.now() / 1000);
  return new Date(unixSeconds * 1000);
}

@Injectable()
export class BillingService {
  private readonly payments: PaymentProvider;
  constructor(
    private readonly wallet: WalletService,
    private readonly intents: PaymentIntentsRepository,
    private readonly subscriptions: SubscriptionsRepository,
  ) {
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
   * POST /billing/subscribe. Cria a Checkout Session (mode=subscription) e
   * retorna o checkoutUrl — quem cria/atualiza a linha em `subscriptions` é
   * SEMPRE o webhook, nunca este método (o pagamento só acontece no
   * checkout do Stripe).
   */
  async subscribe(userId: string, tier: Tier, interval: SubscriptionInterval): Promise<{ checkoutUrl: string }> {
    if (!(this.payments instanceof StripePaymentProvider)) throw new BadRequestException("Assinaturas exigem Stripe configurado (STRIPE_SECRET_KEY ausente).");
    if (!isPaidTier(tier)) throw new BadRequestException("Tier inválido para assinatura (use JUNIOR, SENIOR ou PHD).");
    if (interval !== "MONTH" && interval !== "YEAR") throw new BadRequestException("Intervalo inválido (use MONTH ou YEAR).");

    // Reusa o Customer Stripe do usuário se ele já tiver um (de uma
    // assinatura anterior) — Customers duplicados quebram o portal.
    const existingCustomerId = await this.subscriptions.findCustomerIdForUser(userId);
    const checkoutUrl = await this.payments.createSubscriptionCheckout(userId, tier, interval, existingCustomerId);
    return { checkoutUrl };
  }

  /** GET /billing/subscription — assinatura mais recente do usuário (qualquer status), pra UI exibir. */
  async getSubscription(userId: string): Promise<SubscriptionView | null> {
    const sub = await this.subscriptions.findLatestForUser(userId);
    if (!sub) return null;
    return this.toView(sub);
  }

  private toView(sub: SubscriptionRow): SubscriptionView {
    return { tier: sub.tier, interval: sub.interval, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd.toISOString(), cancelAtPeriodEnd: sub.cancelAtPeriodEnd };
  }

  /**
   * POST /billing/webhook. Autenticidade vem da assinatura Stripe (nunca de
   * JWT — o Stripe não tem sessão de usuário). Verifica com o corpo BRUTO;
   * lança BadRequestException (→ 400) se a assinatura não bater ou o
   * webhook não estiver configurado. Eventos que não interessam recebem 200
   * silencioso.
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

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") await this.createSubscriptionFromCheckout(session);
        else await this.creditFromCheckoutSession(session);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        // Cobre upgrade/downgrade de status, renovação de período e
        // cancelamento agendado (cancel_at_period_end) — não muda o tier:
        // trocar o Price de uma assinatura ativa é coisa do portal do
        // cliente, ainda não implementado.
        await this.subscriptions.updateLifecycle(sub.id, {
          status: mapStripeSubscriptionStatus(sub.status),
          currentPeriodEnd: subscriptionPeriodEnd(sub),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await this.subscriptions.updateStatus(sub.id, "CANCELED");
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // SDK 2025+: o vínculo com a subscription saiu de invoice.subscription
        // e foi pra invoice.parent.subscription_details.subscription.
        const ref = invoice.parent?.subscription_details?.subscription;
        const subId = typeof ref === "string" ? ref : ref?.id;
        if (subId) await this.subscriptions.updateStatus(subId, "PAST_DUE");
        break;
      }
      default:
        break; // qualquer outro evento: 200 silencioso (não é nosso fluxo).
    }
    return { received: true };
  }

  /** Credita a partir de uma Checkout Session paga (pack avulso) — responde rápido (só DB), sem chamadas externas. */
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

  /** Cria a linha em `subscriptions` a partir do checkout.session.completed (mode=subscription). */
  private async createSubscriptionFromCheckout(session: Stripe.Checkout.Session): Promise<void> {
    // client_reference_id, mesma regra do pack: nunca o e-mail do cliente.
    const userId = session.client_reference_id;
    const tier = session.metadata?.tier;
    const interval = session.metadata?.interval;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!userId || !isPaidTier(tier ?? "") || (interval !== "MONTH" && interval !== "YEAR") || !customerId || !subscriptionId) return;
    if (!(this.payments instanceof StripePaymentProvider)) return;

    // A sessão só traz o id da subscription — busca o objeto completo pro
    // status/período reais (nunca assume ACTIVE por conta própria).
    const sub = await this.payments.retrieveSubscription(subscriptionId);
    await this.subscriptions.create({
      id: subscriptionId, userId, tier: tier as "JUNIOR" | "SENIOR" | "PHD", interval,
      stripeCustomerId: customerId, status: mapStripeSubscriptionStatus(sub.status),
      currentPeriodEnd: subscriptionPeriodEnd(sub), cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
  }
}
