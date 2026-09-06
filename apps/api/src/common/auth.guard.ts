/**
 * Guard de autenticação (modo dev). Resolve a identidade do usuário a partir dos
 * cabeçalhos `x-user-id` e `x-user-tier`.
 *
 * SEAM: na Fase 1b este guard é substituído pela integração Auth.js/NextAuth v5
 * (JWT EdDSA/RS256, TDD §2). A forma do `AuthenticatedUser` permanece a mesma,
 * então controllers/serviços não mudam.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Tier } from "@genbreedai/shared";

export interface AuthenticatedUser {
  id: string;
  tier: Tier;
}

const VALID_TIERS: Tier[] = ["FREE", "JUNIOR", "SENIOR", "PHD"];

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const id = req.headers["x-user-id"];
    const tier = req.headers["x-user-tier"];

    if (typeof id !== "string" || id.length === 0) {
      throw new UnauthorizedException("Cabeçalho x-user-id ausente.");
    }
    if (typeof tier !== "string" || !VALID_TIERS.includes(tier as Tier)) {
      throw new UnauthorizedException("Cabeçalho x-user-tier inválido (FREE|JUNIOR|SENIOR|PHD).");
    }
    req.user = { id, tier: tier as Tier };
    return true;
  }
}

/** Extrai o usuário autenticado injetado pelo AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return req.user;
  },
);
