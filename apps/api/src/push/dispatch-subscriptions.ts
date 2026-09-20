/**
 * Avisos de assinatura por push (ADR-0030) — segundo passo do MESMO cron `push:dispatch` (o de gestação é
 * `dispatch-ready.ts`): sem serviço novo no Railway, mesmo pool, mesmo `PushService`, mesmas guardas. Sem `dotenv`, sem
 * `process.exit`: importável nos testes (o executável é `dispatch-ready-cli.ts`).
 *
 * Três avisos, cada um UMA vez por período da assinatura, com marcação atômica (padrão do `ready_notified_at`):
 *  - "Sua assinatura vence em N dias" (≤ 3 dias antes do fim, para quem não renova sozinho);
 *  - "O pagamento da sua assinatura falhou" (PAST_DUE ainda em vigor);
 *  - "Sua conta voltou para o plano gratuito" (caiu de fato — só se o jogador está mesmo no Free).
 * O clique leva à página de planos. A decisão de QUEM merece aviso é de `subscription-notices.ts` (que usa a regra de
 * vigência única do ADR-0029, sem reimplementá-la).
 *
 * Como o gestação: a reivindicação (`claimNotice`) vem ANTES do envio ("no máximo uma vez") e vale MESMO se o dono
 * não tem dispositivo de push — a faixa no app cobre esse jogador (e assinar o push depois não gera aviso velho).
 * Sem chaves VAPID: recurso desligado, nada é reivindicado. Nunca em silêncio: o resumo é sempre impresso.
 */
import type { Clock } from "../common/clock";
import { isPushEnabled } from "../common/vapid";
import { TierService } from "../billing/tier.service";
import type { SubscriptionsRepository, SubscriptionNoticeKind } from "../billing/subscriptions.repository";
import { NOTICE_URL, NOTICE_WINDOWS, alreadyNoticed, noticeCopy, pushNoticeKinds } from "../billing/subscription-notices";
import type { PushPayload } from "./push-sender";
import type { PushService } from "./push.service";

export interface SubscriptionNoticeSummary {
  /** `true` = Web Push desligado (sem VAPID): nada foi reivindicado nem enviado. */
  disabled: boolean;
  /** Assinaturas olhadas (candidatas pelo repositório). */
  candidatas: number;
  /** Avisos reivindicados nesta execução (uma assinatura pode ter mais de um). */
  reivindicados: number;
  /** Reivindicados, por tipo. */
  porTipo: Record<SubscriptionNoticeKind, number>;
  /** Chegaram a pelo menos um dispositivo do dono. */
  avisados: number;
  /** Donos sem nenhum dispositivo de push (ou todos sumiram, 404/410) — não é falha; a faixa no app cobre. */
  semAssinatura: number;
  /** "Voltou para o gratuito" reivindicado mas SEM push: o jogador não está no Free (concessão em vigor). */
  pulados: number;
  /** Não chegaram a nenhum dispositivo por erro (rede, 5xx, chave). O aviso de push se perde (a faixa continua). */
  falhas: number;
}

export interface SubscriptionNoticeDeps {
  subscriptions: SubscriptionsRepository;
  push: PushService;
  tiers: TierService;
  clock: Clock;
}

const emptySummary = (disabled: boolean): SubscriptionNoticeSummary => ({
  disabled, candidatas: 0, reivindicados: 0, porTipo: { EXPIRING: 0, PAST_DUE: 0, DROPPED: 0 },
  avisados: 0, semAssinatura: 0, pulados: 0, falhas: 0,
});

export function subscriptionSummaryLines(s: SubscriptionNoticeSummary): string[] {
  return [
    `ASSINATURAS — CANDIDATAS: ${s.candidatas} | AVISOS: ${s.reivindicados} (vence em breve: ${s.porTipo.EXPIRING}, pagamento falhou: ${s.porTipo.PAST_DUE}, voltou ao gratuito: ${s.porTipo.DROPPED})`,
    `ASSINATURAS — AVISADOS: ${s.avisados} | SEM PUSH: ${s.semAssinatura} | PULADOS: ${s.pulados} | FALHAS: ${s.falhas}`,
  ];
}

/** Payload do push: título/corpo iguais aos da faixa; clique → página de planos; `tag` por tipo+assinatura+período. */
export function buildSubscriptionPayload(kind: SubscriptionNoticeKind, copy: { title: string; body: string }, subscriptionId: string, periodEnd: Date): PushPayload {
  return { title: copy.title, body: copy.body, icon: "/icon-192.png", url: NOTICE_URL, tag: `assinatura-${kind}-${subscriptionId}-${periodEnd.getTime()}` };
}

/**
 * Lança se o envio for IMPOSSÍVEL com as chaves definidas (biblioteca `web-push` ausente) — antes de reivindicar
 * qualquer aviso. Sem chaves VAPID NÃO lança: devolve `disabled`.
 */
export async function dispatchSubscriptionNotices(deps: SubscriptionNoticeDeps, log: (line: string) => void = console.log): Promise<SubscriptionNoticeSummary> {
  if (!isPushEnabled()) {
    log("Avisos de assinatura por push DESLIGADOS (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não definidas) — nada feito; nenhum aviso foi marcado. A faixa no app segue funcionando.");
    for (const line of subscriptionSummaryLines(emptySummary(true))) log(line);
    return emptySummary(true);
  }
  await deps.push.ready();

  const summary = emptySummary(false);
  const now = deps.clock.now();
  const candidates = await deps.subscriptions.listNoticeCandidates(now, NOTICE_WINDOWS);
  summary.candidatas = candidates.length;

  for (const row of candidates) {
    for (const kind of pushNoticeKinds(row, now)) {
      if (alreadyNoticed(row, kind)) continue;                       // pré-filtro barato; a garantia é o claim abaixo
      if (!(await deps.subscriptions.claimNotice(row, kind))) continue; // outra execução levou, ou a linha mudou (renovou/reativou)
      summary.reivindicados++;
      summary.porTipo[kind]++;

      if (kind === "DROPPED" && (await deps.tiers.resolve(row.userId)) !== "FREE") {
        summary.pulados++; // caiu a assinatura, mas uma concessão em vigor o mantém acima do Free: "voltou para o gratuito" seria falso
        continue;
      }
      const payload = buildSubscriptionPayload(kind, noticeCopy(kind, row, now), row.id, row.currentPeriodEnd);
      const r = await deps.push.sendToUser(row.userId, payload);
      if (r.error) { summary.falhas++; log(`  usuário ${row.userId}: FALHA ao ler dispositivos (${kind}) — ${r.error}`); }
      else if (r.sent > 0) summary.avisados++;
      else if (r.failed > 0) { summary.falhas++; log(`  usuário ${row.userId}: FALHA (${kind}) — ${r.failed} dispositivo(s) recusaram o envio`); }
      else summary.semAssinatura++;
    }
  }

  for (const line of subscriptionSummaryLines(summary)) log(line);
  return summary;
}
