/**
 * Guard de cota de cruzamento anti-P2W (ADR-0019). Aplica a `CrossQuotaPolicy`
 * do tier do usuário (rolling7d ou day, ver common/tiers.ts). Se estourar,
 * lança 429. NÃO repassa tier ao motor — só decide se a requisição prossegue;
 * a probabilidade do cruzamento é idêntica em todo tier, só QUANTOS
 * cruzamentos por janela muda.
 *
 * Tier vem de TierService.resolve() (consulta subscriptions/granted_tiers),
 * NUNCA de user.tier (JWT) — senão um upgrade via Stripe só valeria depois de
 * relogar.
 *
 * A reserva (QuotaService.reserve) é feita AQUI, antes do motor rodar, e o id
 * da reserva fica em `req.crossReservationId` — CrossController confirma
 * (sucesso) ou estorna (falha) depois, como já fazia antes desta correção.
 */

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "../common/auth.guard";
import { tierPolicy } from "../common/tiers";
import { QuotaService } from "./quota.service";
import { TierService } from "../billing/tier.service";

export interface CrossReservedRequest extends FastifyRequest {
  user: AuthenticatedUser;
  crossReservationId?: string;
}

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(private readonly quota: QuotaService, private readonly tier: TierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CrossReservedRequest>();
    const user = req.user;
    const tier = await this.tier.resolve(user.id, user.tier);
    const policy = tierPolicy(tier).crossQuota;

    const reservationId = await this.quota.reserve(user.id, policy);
    if (!reservationId) {
      const nextAt = await this.quota.nextAvailableAt(user.id, policy);
      const janela = policy.window === "day" ? "por dia" : "a cada 7 dias";
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Cota de cruzamentos esgotada para o tier ${tier} (limite ${policy.limit} ${janela}).`,
          error: "Too Many Requests",
          nextAvailableAt: nextAt ? nextAt.toISOString() : null,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    req.crossReservationId = reservationId;
    return true;
  }
}
