import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { ReferralService } from "./referral.service";

@Controller("api/v1/referral")
export class ReferralController {
  constructor(private readonly ref: ReferralService) {}

  @Get()
  @UseGuards(AuthGuard)
  async myLink(@CurrentUser() user: AuthenticatedUser) {
    const link = await this.ref.getOrCreateLink(user.id);
    return { code: link.code, clicks: link.clicks, installs: link.installs, d1: link.d1, d7: link.d7, conversions: link.conversions, creditsEarned: link.creditsEarned };
  }

  /** Público: registra clique quando alguém abre o link. */
  @Post("click")
  async click(@Body() body: { code: string }) {
    if (body?.code) await this.ref.recordClick(body.code);
    return { ok: true };
  }

  // Marcos NÃO são afirmáveis pelo cliente — sem rota pública (a antiga
  // POST /referral/event foi removida em 14/09: permitia crédito infinito
  // variando o id do indicado). São server-side (ADR-0024):
  //  - "cadastrou": AuthService.register()/google() → ReferralService.linkReferred() (só GRAVA o vínculo, não credita);
  //  - "converteu": webhook do Stripe (BillingService) → ReferralService.recordConversion() — o ÚNICO que paga.
  // D1/D7 ainda não existem (precisam de tarefa agendada).
}
