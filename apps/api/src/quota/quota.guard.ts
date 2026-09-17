/**
 * Guard do limite TÉCNICO horário de POST /cross (ADR-0020 — 60/hora, igual
 * pra todo tier; NÃO é mais a cota de cruzamento por tier, que virou cota de
 * REVELAÇÃO, cobrada no incubator.controller.ts). Anti-abuso/anti-automação,
 * invisível no jogo — se estourar, 429 "Muitos cruzamentos seguidos, tente
 * em instantes." NÃO repassa tier ao motor — só decide se a requisição
 * prossegue; a probabilidade do cruzamento é idêntica em todo tier.
 *
 * Tier vem de TierService.resolve() (consulta subscriptions/granted_tiers),
 * NUNCA de user.tier (JWT) — senão um upgrade via Stripe só valeria depois de
 * relogar (hoje `hourlyCrossLimit` é igual pra todo tier, mas resolver o tier
 * certo mantém a mesma disciplina dos outros guards).
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
    const policy = { limit: tierPolicy(tier).hourlyCrossLimit, window: "hour" as const };

    const reservationId = await this.quota.reserve("cross_hourly", user.id, policy);
    if (!reservationId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Muitos cruzamentos seguidos, tente em instantes.",
          error: "Too Many Requests",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    req.crossReservationId = reservationId;
    return true;
  }
}
