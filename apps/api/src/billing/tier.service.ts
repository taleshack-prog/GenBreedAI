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

@Injectable()
export class TierService {
  constructor(
    private readonly subscriptions: SubscriptionsRepository,
    private readonly grants: GrantedTiersRepository,
  ) {}

  /**
   * `devHint`: passe `user.tier` (do AuthGuard) aqui sempre — é ignorado em
   * produção (só vale com AUTH_DEV_HEADERS=true) e, mesmo em dev, nunca
   * derruba uma assinatura/concessão real: só preenche quando não há
   * nenhuma, pra dar pra simular tier sem escrever linha na tabela.
   */
  async resolve(userId: string, devHint?: Tier): Promise<Tier> {
    const sub = await this.subscriptions.findActiveForUser(userId);
    if (sub) return sub.tier;
    const grant = await this.grants.findActiveForUser(userId);
    if (grant) return grant.tier;
    if (devHint && isDevFlagEnabled("AUTH_DEV_HEADERS")) return devHint;
    return "FREE";
  }
}
