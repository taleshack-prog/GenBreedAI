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
import { UserRepository } from "../auth/user.repository";
import { SubscriptionsRepository } from "./subscriptions.repository";
import { pickBannerNotice } from "./subscription-notices";
import { Clock } from "../common/clock";

@Controller("api/v1/me")
export class MeController {
  // `UserRepository` vem do `AuthModule` (@Global, exporta a porta); `Clock` do `ClockModule` (importado por `TierModule`).
  constructor(
    private readonly tierService: TierService,
    private readonly quota: QuotaService,
    private readonly users: UserRepository,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * ADR-0030 — a faixa "sua assinatura vence / o pagamento falhou / voltou para o gratuito" que a web mostra ao abrir
   * qualquer tela. O SERVIDOR decide (a regra de vigência é a do ADR-0029; a web não a duplica) e devolve título e corpo
   * prontos — os mesmos do push. `notice: null` = nada a mostrar (inclusive quando a assinatura voltou a ficar ativa).
   * Rota separada de `/me/tier` de propósito: é chamada em toda tela do app e não precisa das consultas de cota.
   */
  @Get("subscription-notice")
  @UseGuards(AuthGuard)
  async subscriptionNotice(@CurrentUser() user: AuthenticatedUser) {
    const [rows, effectiveTier] = await Promise.all([this.subscriptions.listForUser(user.id), this.tierService.resolve(user.id)]);
    return { notice: pickBannerNotice(rows, this.clock.now(), effectiveTier) };
  }

  @Get("tier")
  @UseGuards(AuthGuard)
  async tier(@CurrentUser() user: AuthenticatedUser) {
    const tier = await this.tierService.resolve(user.id, user.tier);
    const policy = tierPolicy(tier);
    const [used, nextAvailableAt, firstGestation] = await Promise.all([
      this.quota.used("birth", user.id, policy.birthQuota),
      this.quota.nextAvailableAt("birth", user.id, policy.birthQuota),
      this.users.getFirstGestation(user.id),
    ]);
    return {
      tier,
      // ADR-0025: a 1ª gestação da conta (5 min) ainda não foi usada — a web
      // mostra "Primeira gestação acelerada: 5 minutos" no lugar do tempo da aura.
      firstGestationAvailable: firstGestation === null,
      birthQuota: {
        limit: policy.birthQuota.limit,
        window: policy.birthQuota.window,
        used,
        nextAvailableAt: nextAvailableAt ? nextAvailableAt.toISOString() : null,
      },
      monthlyExtraImages: policy.monthlyExtraImages,
      biweeklyBonus: policy.biweeklyBonus,
    };
  }
}
