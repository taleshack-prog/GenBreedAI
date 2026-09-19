import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { ReferralService, PACK_TRIO_SIZE } from "./referral.service";

@Controller("api/v1/referral")
export class ReferralController {
  constructor(private readonly ref: ReferralService) {}

  /**
   * Link + contadores + progresso por tamanho de pacote (ADR-0024, rev. 2). `packs` = compras de
   * pacote de créditos dos indicados e quanto falta pro próximo trio (cada tamanho é um balde;
   * o trio precisa ser do MESMO indicado). D1/D7 não existem mais.
   */
  @Get()
  @UseGuards(AuthGuard)
  async myLink(@CurrentUser() user: AuthenticatedUser) {
    const link = await this.ref.getOrCreateLink(user.id);
    const packs = await this.ref.getPackProgress(user.id);
    return {
      code: link.code, clicks: link.clicks, installs: link.installs, conversions: link.conversions,
      creditsEarned: link.creditsEarned, trioSize: PACK_TRIO_SIZE, packs,
    };
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
  //  - "converteu": webhook do Stripe (BillingService) → ReferralService.recordConversion() — assinatura do indicado;
  //  - "comprou pacote": webhook do Stripe (BillingService) → ReferralService.recordPackPurchase() — a cada 3 pacotes
  //    iguais do MESMO indicado. Só recompensa quando o indicado GASTA; D1/D7 foram cancelados.
}
