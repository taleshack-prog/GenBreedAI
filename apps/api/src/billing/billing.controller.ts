import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Post, Req, UseGuards, type RawBodyRequest } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Tier } from "@genbreedai/shared";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { BillingService } from "./billing.service";
import type { SubscriptionInterval } from "./subscription-plans";
import { isDevFlagEnabled } from "../common/dev-flags";

@Controller("api/v1/billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("packs")
  packs() { return this.billing.packs(); }

  @Post("checkout")
  @UseGuards(AuthGuard)
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() body: { packId: string }) {
    return this.billing.createCheckout(user.id, body.packId);
  }

  @Post("confirm")
  @UseGuards(AuthGuard)
  confirm(@CurrentUser() user: AuthenticatedUser, @Body() body: { intentId: string }) {
    // Confirmação MANUAL: só dev/teste (o StubPaymentProvider aprova tudo, e
    // mesmo com Stripe o chamador creditaria a própria carteira com o intentId
    // de qualquer sessão paga). Em PRODUÇÃO a flag é ignorada (dev-flags.ts) — o
    // crédito real vem só do webhook do Stripe. A web só chama /confirm sem
    // `checkoutUrl` (stub de dev), então nada legítimo depende disto em prod.
    if (!isDevFlagEnabled("BILLING_STUB_ENABLED")) {
      throw new ForbiddenException("Confirmação manual desabilitada.");
    }
    return this.billing.confirm(user.id, body.intentId);
  }

  @Post("subscribe")
  @UseGuards(AuthGuard)
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() body: { tier: Tier; interval: SubscriptionInterval }) {
    return this.billing.subscribe(user.id, body.tier, body.interval);
  }

  @Get("subscription")
  @UseGuards(AuthGuard)
  subscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.getSubscription(user.id);
  }

  /**
   * SEM AuthGuard: a autenticidade vem da assinatura Stripe
   * (stripe-signature + STRIPE_WEBHOOK_SECRET), não de JWT — o Stripe não
   * carrega sessão de usuário. Precisa do corpo BRUTO (rawBody: true em
   * main.ts) pra stripe.webhooks.constructEvent funcionar.
   */
  @Post("webhook")
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<FastifyRequest>, @Headers("stripe-signature") signature?: string) {
    if (!req.rawBody) throw new BadRequestException("Corpo bruto ausente.");
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}
