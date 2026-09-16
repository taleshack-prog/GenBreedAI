/**
 * Tier EFETIVO do usuário autenticado — única fonte de verdade pra UI que
 * decide por tier (card de perfil, gate de fenótipo, pool de espécies etc).
 * SEMPRE via TierService.resolve() (subscriptions → granted_tiers → devHint
 * dev-only → FREE), nunca a partir de um cabeçalho ou do JWT sozinho.
 */
import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { TierService } from "./tier.service";
import { tierPolicy } from "../common/tiers";

@Controller("api/v1/me")
export class MeController {
  constructor(private readonly tierService: TierService) {}

  @Get("tier")
  @UseGuards(AuthGuard)
  async tier(@CurrentUser() user: AuthenticatedUser) {
    const tier = await this.tierService.resolve(user.id, user.tier);
    const policy = tierPolicy(tier);
    return { tier, dailyCrosses: policy.dailyCrosses, monthlyImages: policy.monthlyPremiumImages };
  }
}
