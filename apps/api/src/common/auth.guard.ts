/**
 * Guard de autenticação. Produção: valida JWT Bearer (emitido pelo AuthService).
 * Dev: se AUTH_DEV_HEADERS=true, aceita x-user-id (+ x-user-tier opcional) —
 * usado por testes e ferramentas locais; a web não manda mais x-user-tier
 * (removido o antigo seletor de "tier de teste"). Sem credencial válida → 401.
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

    // 2) Dev headers (apenas se habilitado). x-user-tier é OPCIONAL — a web não
    // manda mais tier nenhum (removido o seletor "tier de teste"); só serve de
    // devHint pro TierService (que só o usa se não houver assinatura/concessão
    // real para o id, e mesmo assim só com AUTH_DEV_HEADERS=true). Ausente ou
    // inválido → devHint "FREE" (menor privilégio), nunca PHD por omissão.
    if (process.env.AUTH_DEV_HEADERS === "true") {
      const id = req.headers["x-user-id"];
      if (typeof id === "string" && id.length > 0) {
        const tierHeader = req.headers["x-user-tier"];
        const tier = typeof tierHeader === "string" && VALID_TIERS.includes(tierHeader as Tier) ? (tierHeader as Tier) : "FREE";
        req.user = { id, tier };
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
