/**
 * Guard de autenticação. Produção: valida JWT Bearer (emitido pelo AuthService).
 * Dev: se AUTH_DEV_HEADERS=true, aceita x-user-id/x-user-tier (para o seletor de
 * tier de teste e ferramentas locais). Sem token válido → 401.
 */
import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator, Optional,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Tier } from "@genbreedai/shared";
import { AuthService } from "../auth/auth.service";

export interface AuthenticatedUser { id: string; tier: Tier; }
const VALID_TIERS: Tier[] = ["FREE", "JUNIOR", "SENIOR", "PHD"];

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Optional() private readonly auth?: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();

    // 1) JWT Bearer (produção).
    const authz = req.headers["authorization"];
    if (typeof authz === "string" && authz.startsWith("Bearer ") && this.auth) {
      try {
        const payload = this.auth.verify(authz.slice(7));
        req.user = { id: payload.sub, tier: (payload.tier as Tier) ?? "FREE" };
        return true;
      } catch {
        throw new UnauthorizedException("Sessão inválida ou expirada.");
      }
    }

    // 2) Dev headers (apenas se habilitado).
    if (process.env.AUTH_DEV_HEADERS === "true") {
      const id = req.headers["x-user-id"];
      const tier = req.headers["x-user-tier"];
      if (typeof id === "string" && id.length > 0 && typeof tier === "string" && VALID_TIERS.includes(tier as Tier)) {
        req.user = { id, tier: tier as Tier };
        return true;
      }
    }

    throw new UnauthorizedException("Autenticação necessária.");
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return req.user;
  },
);
