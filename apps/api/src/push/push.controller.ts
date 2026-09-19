/**
 * Rotas de Web Push (ADR-0028):
 *  - `GET    /api/v1/push/config`    — público: `{ enabled }` (o recurso só existe com as chaves VAPID).
 *  - `POST   /api/v1/push/subscribe` — grava ou atualiza a assinatura do usuário autenticado.
 *  - `DELETE /api/v1/push/subscribe` — remove a assinatura (só se for do usuário).
 *
 * Sem VAPID: `config` diz `enabled:false` e `subscribe` responde 503 (a web esconde o botão);
 * `DELETE` continua funcionando (limpar nunca é bloqueado). Nunca devolve chaves de assinatura.
 * O `endpoint` vem do cliente e o servidor faz POST nele ao enviar: só hosts de serviços de
 * push reais são aceitos (anti-SSRF, ver `push-endpoint.ts`).
 */
import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpException, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { PushService } from "./push.service";
import { isAllowedPushEndpoint } from "./push-endpoint";
import type { PushSubscriptionInput } from "./push-subscription.repository";

const MAX_KEY_LENGTH = 256;
const MAX_USER_AGENT_LENGTH = 255;

const isKey = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_KEY_LENGTH;

/** Corpo = `PushSubscription.toJSON()` do navegador: `{ endpoint, keys: { p256dh, auth } }`. */
export function parseSubscribeBody(body: unknown, userAgent: string | undefined): PushSubscriptionInput {
  const b = (body && typeof body === "object" ? body : {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!isAllowedPushEndpoint(b.endpoint)) {
    throw new BadRequestException("endpoint inválido: precisa ser uma URL https de um serviço de push de navegador.");
  }
  if (!isKey(b.keys?.p256dh) || !isKey(b.keys?.auth)) {
    throw new BadRequestException("keys.p256dh e keys.auth são obrigatórias.");
  }
  return {
    endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth,
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}

@Controller("api/v1/push")
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get("config")
  config() {
    return { enabled: this.push.isEnabled() };
  }

  @Post("subscribe")
  @UseGuards(AuthGuard)
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("user-agent") userAgent?: string,
  ) {
    if (!this.push.isEnabled()) {
      throw new HttpException(
        { statusCode: HttpStatus.SERVICE_UNAVAILABLE, message: "Notificações não estão ativadas neste servidor.", error: "Service Unavailable" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const input = parseSubscribeBody(body, userAgent);
    await this.push.subscribe(user.id, input);
    return { subscribed: true };
  }

  @Delete("subscribe")
  @UseGuards(AuthGuard)
  async unsubscribe(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const endpoint = (body && typeof body === "object" ? (body as { endpoint?: unknown }).endpoint : undefined);
    if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2048) {
      throw new BadRequestException("endpoint é obrigatório.");
    }
    const removed = await this.push.unsubscribe(user.id, endpoint);
    return { removed };
  }
}
