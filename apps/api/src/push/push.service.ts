/**
 * Serviço de Web Push (ADR-0028): guarda as assinaturas do usuário e envia a notificação
 * a TODOS os dispositivos dele. Regras:
 *  - **Nunca lança pra quem chama** (`sendToUser`): falha de envio não pode quebrar o
 *    fluxo que a disparou — vira contagem no resumo.
 *  - Serviço de push devolveu **404 ou 410** → o dispositivo sumiu (app desinstalado,
 *    permissão revogada): a assinatura é APAGADA. Outro erro (rede, 5xx, 401/403 de
 *    chave) → a assinatura fica, com `failed_at`.
 *  - Sem chaves VAPID o recurso está desligado: nada é enviado e nada quebra.
 * Tempo vem de `Clock` (regra 3 do CLAUDE.md), nunca `new Date()`.
 */
import { Injectable } from "@nestjs/common";
import { Clock } from "../common/clock";
import { isPushEnabled } from "../common/vapid";
import { PushSender, type PushPayload } from "./push-sender";
import { PushSubscriptionRepository, type PushSubscriptionInput, type StoredPushSubscription } from "./push-subscription.repository";

export interface SendSummary {
  /** `false` = recurso desligado (sem VAPID): nada foi feito. */
  enabled: boolean;
  /** Assinaturas que o usuário tinha ao começar o envio. */
  subscriptions: number;
  /** Dispositivos que o serviço de push aceitou. */
  sent: number;
  /** Assinaturas apagadas por 404/410 (dispositivo sumiu). */
  removed: number;
  /** Dispositivos com erro que NÃO é 404/410 (a assinatura fica). */
  failed: number;
  /** Erro ao LER as assinaturas (banco): nada foi enviado. */
  error?: string;
}

const statusOf = (e: unknown): number | undefined => {
  const s = (e as { statusCode?: unknown } | null)?.statusCode;
  return typeof s === "number" ? s : undefined;
};

@Injectable()
export class PushService {
  constructor(
    private readonly repo: PushSubscriptionRepository,
    private readonly sender: PushSender,
    private readonly clock: Clock,
  ) {}

  isEnabled(): boolean { return isPushEnabled(); }

  subscribe(userId: string, input: PushSubscriptionInput): Promise<StoredPushSubscription> {
    return this.repo.upsert(userId, input, this.clock.now());
  }

  unsubscribe(userId: string, endpoint: string): Promise<boolean> {
    return this.repo.removeByEndpoint(userId, endpoint);
  }

  /** Verifica se o envio é possível (VAPID + biblioteca). Lança se não — `push:dispatch` usa antes de reivindicar entradas. */
  ready(): Promise<void> { return this.sender.ready(); }

  async sendToUser(userId: string, payload: PushPayload): Promise<SendSummary> {
    const summary: SendSummary = { enabled: isPushEnabled(), subscriptions: 0, sent: 0, removed: 0, failed: 0 };
    if (!summary.enabled) return summary;

    let subs: StoredPushSubscription[];
    try {
      subs = await this.repo.listByUser(userId);
    } catch (e) {
      summary.error = e instanceof Error ? e.message : String(e);
      return summary;
    }
    summary.subscriptions = subs.length;

    for (const sub of subs) {
      try {
        await this.sender.send({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
        summary.sent++;
        await this.repo.markUsed(sub.id, this.clock.now()).catch(() => {});
      } catch (e) {
        const status = statusOf(e);
        if (status === 404 || status === 410) {
          summary.removed++;
          await this.repo.deleteById(sub.id).catch(() => {});
        } else {
          summary.failed++;
          await this.repo.markFailed(sub.id, this.clock.now()).catch(() => {});
        }
      }
    }
    return summary;
  }
}
