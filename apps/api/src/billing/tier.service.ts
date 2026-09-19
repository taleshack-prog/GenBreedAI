/**
 * Resolve o tier EFETIVO do usuário por consulta ao banco — NUNCA pelo JWT.
 *
 * Motivo: o JWT é emitido no login e só é reemitido no próximo login. Quando
 * o webhook do Stripe muda a assinatura às 3h da manhã, o usuário não pode
 * precisar relogar pra ver o que pagou — então nenhum ponto que GATEIA
 * feature (cota de cruzamento, cota de imagem, pool de espécie) pode usar
 * user.tier do token; todos consultam TierService.resolve() por request.
 *
 * Prioridade: assinatura ACTIVE (ou PAST_DUE ainda dentro do período) → tier
 * dela; senão, granted_tiers não expirado → tier concedido; senão, SE
 * AUTH_DEV_HEADERS=true, o `devHint` (x-user-tier do AuthGuard, opcional — só
 * testes/ferramentas locais mandam; a web nunca envia); senão → FREE.
 */
import { Injectable } from "@nestjs/common";
import type { Tier } from "@genbreedai/shared";
import { SubscriptionsRepository } from "./subscriptions.repository";
import { GrantedTiersRepository } from "./granted-tiers.repository";
import { isDevFlagEnabled } from "../common/dev-flags";
import { Clock, SystemClock } from "../common/clock";

@Injectable()
export class TierService {
  /**
   * "Agora" (a concessão de 30 dias ainda vale? a assinatura PAST_DUE ainda está no período?) vem de `Clock`
   * (`common/clock.ts`, ADR-0029) e é PASSADO como parâmetro aos repositórios — eles ficam sem relógio (só dado), o
   * que mantém as portas simples e os adapters (in-memory e Drizzle) idênticos. O padrão `SystemClock` mantém
   * produção idêntica (relógio real) e as chamadas `new TierService(subs, grants)` de testes/helpers válidas;
   * em produção o Nest injeta o `Clock` compartilhado (`TierModule` importa `ClockModule`).
   */
  constructor(
    private readonly subscriptions: SubscriptionsRepository,
    private readonly grants: GrantedTiersRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  /**
   * `devHint`: passe `user.tier` (do AuthGuard) aqui sempre — é ignorado em
   * produção (só vale com AUTH_DEV_HEADERS=true) e, mesmo em dev, nunca
   * derruba uma assinatura/concessão real: só preenche quando não há
   * nenhuma, pra dar pra simular tier sem escrever linha na tabela.
   */
  async resolve(userId: string, devHint?: Tier): Promise<Tier> {
    const now = this.clock.now(); // UM instante para a decisão inteira (assinatura E concessão veem o mesmo "agora")
    const sub = await this.subscriptions.findActiveForUser(userId, now);
    if (sub) return sub.tier;
    const grant = await this.grants.findActiveForUser(userId, now);
    if (grant) return grant.tier;
    if (devHint && isDevFlagEnabled("AUTH_DEV_HEADERS")) return devHint;
    return "FREE";
  }
}
