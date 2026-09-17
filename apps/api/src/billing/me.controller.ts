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
import { QuotaService } from "../quota/quota.service";

@Controller("api/v1/me")
export class MeController {
  constructor(private readonly tierService: TierService, private readonly quota: QuotaService) {}

  @Get("tier")
  @UseGuards(AuthGuard)
  async tier(@CurrentUser() user: AuthenticatedUser) {
    const tier = await this.tierService.resolve(user.id, user.tier);
    const policy = tierPolicy(tier);
    const [used, nextAvailableAt] = await Promise.all([
      this.quota.used(user.id, policy.crossQuota),
      this.quota.nextAvailableAt(user.id, policy.crossQuota),
    ]);
    return {
      tier,
      crossQuota: {
        limit: policy.crossQuota.limit,
        window: policy.crossQuota.window,
        used,
        nextAvailableAt: nextAvailableAt ? nextAvailableAt.toISOString() : null,
      },
      monthlyExtraImages: policy.monthlyExtraImages,
      weeklyBonus: policy.weeklyBonus,
    };
  }
}
