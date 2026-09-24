import { Controller, Get, Headers, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { isValidBearer } from "./health-auth";
import { HealthService } from "./health.service";

/**
 * `GET /api/v1/health/summary` — health check para o painel central da Hack Tech Farm (ADR-0039), que faz PULL a cada minuto com
 * `Authorization: Bearer <MONITOR_TOKEN>`. NÃO passa pelo `AuthGuard` (o painel não é jogador).
 *
 *  - `MONITOR_TOKEN` ausente/vazio no ambiente → 503, SEM corpo (nunca libera por omissão);
 *  - sem cabeçalho ou token errado → 401, SEM corpo explicativo (comparação em tempo constante);
 *  - senão → 200 SEMPRE, com o resumo (mesmo com tudo fora); 5xx só se a própria rota quebrar (500, sem corpo).
 */
@Controller("api/v1/health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("summary")
  async summary(@Headers("authorization") authorization: string | undefined, @Res() reply: FastifyReply): Promise<void> {
    const expected = process.env.MONITOR_TOKEN;
    if (!expected) { reply.code(503).send(); return; }
    if (!isValidBearer(authorization, expected)) { reply.code(401).send(); return; }
    try {
      const body = await this.health.summary();
      reply.code(200).header("Cache-Control", "no-store").send(body);
    } catch {
      reply.code(500).send();
    }
  }
}
