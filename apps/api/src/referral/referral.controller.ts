import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { ReferralService, type RefEvent } from "./referral.service";

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

  /** Registra marco (install/d1/d7/convert) do indicado. */
  @Post("event")
  async event(@Body() body: { code: string; referredId: string; kind: RefEvent }) {
    if (!body?.code || !body?.referredId || !body?.kind) return { credited: 0 };
    return this.ref.recordEvent(body.code, body.referredId, body.kind);
  }
}
