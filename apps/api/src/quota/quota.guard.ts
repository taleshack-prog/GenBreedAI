/**
 * Guard de cota anti-P2W (TDD §0 / §6 / §8).
 *
 * Aplica o limite diário de cruzamentos do tier do usuário. Se estourar, lança
 * 429. NÃO repassa tier ao motor — apenas decide se a requisição pode prosseguir.
 * Assim, a probabilidade do cruzamento é idêntica para todos os tiers; o tier só
 * muda QUANTOS cruzamentos por dia, jamais o resultado de cada um.
 *
 * Tier vem de TierService.resolve() (consulta subscriptions/granted_tiers),
 * NUNCA de user.tier (JWT) — senão um upgrade via Stripe só valeria depois de
 * relogar.
 */

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../common/auth.guard";
import { tierPolicy } from "../common/tiers";
import { QuotaService } from "./quota.service";
import { TierService } from "../billing/tier.service";

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(private readonly quota: QuotaService, private readonly tier: TierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    const user = req.user;
    const tier = await this.tier.resolve(user.id, user.tier);
    const limit = tierPolicy(tier).dailyCrosses;

    if (!this.quota.tryConsume(user.id, limit)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Cota diária de cruzamentos esgotada para o tier ${tier} (limite ${limit}/dia).`,
          error: "Too Many Requests",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
