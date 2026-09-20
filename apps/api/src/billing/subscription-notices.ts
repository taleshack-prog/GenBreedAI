/**
 * Avisos de assinatura (ADR-0030) — funções PURAS (sem I/O, sem relógio próprio: `now` é parâmetro, vem do `Clock`).
 * Três momentos, dois canais (push pelo cron `push:dispatch`; faixa no app por `GET /me/subscription-notice`):
 *
 *  - `EXPIRING` — "Sua assinatura vence em N dias": no máximo 3 dias antes do fim do período pago, para quem NÃO vai
 *    renovar sozinho (assinatura `ACTIVE` com cancelamento agendado, ou `PAST_DUE`). Assinatura `ACTIVE` que renova
 *    automaticamente NÃO é avisada (a leitura literal mandaria "vence em 3 dias" todo mês a todo assinante, o que é falso).
 *  - `PAST_DUE` — "O pagamento da sua assinatura falhou": status `PAST_DUE` com o plano ainda em vigor (o Stripe está
 *    tentando recuperar).
 *  - `DROPPED` — "Sua conta voltou para o plano gratuito": a assinatura deixou de valer (CANCELED, ou PAST_DUE com o período
 *    vencido) e o jogador está mesmo no Free.
 *
 * A REGRA de quando a assinatura vale NÃO é reimplementada aqui: usa `isSubscriptionInForce` (a única definição,
 * ADR-0029). `INCOMPLETE` nunca avisa (o jogador nunca teve o plano). Quem cancelou de propósito também é avisado
 * (3 dias antes e ao cair): é confirmação útil e convite a voltar.
 */
import type { Tier } from "@genbreedai/shared";
import { GAME_TIME_ZONE } from "../common/sao-paulo-time";
import { isSubscriptionInForce, type SubscriptionNoticeKind, type SubscriptionRow, type NoticeWindows } from "./subscriptions.repository";

export type { SubscriptionNoticeKind };

const DAY_MS = 24 * 60 * 60 * 1000;
/** "3 dias antes do fim do período pago". */
export const EXPIRY_WARNING_DAYS = 3;
/** Push de "voltou para o gratuito" só para quedas RECENTES (evita push em massa a ex-assinantes antigos no 1º rodar do cron). */
export const DROPPED_PUSH_WINDOW_DAYS = 2;
/** A faixa "voltou para o gratuito" fica visível por este tempo depois do fim do período (dispensável antes disso). */
export const DROPPED_BANNER_DAYS = 7;
/** Clique na notificação / link da faixa. */
export const NOTICE_URL = "/app/planos";

/** Janelas de candidatas para o repositório (`listNoticeCandidates`). */
export const NOTICE_WINDOWS: NoticeWindows = { expiringMs: EXPIRY_WARNING_DAYS * DAY_MS, droppedMs: DROPPED_PUSH_WINDOW_DAYS * DAY_MS };

const PLAN_NAME: Record<string, string> = { JUNIOR: "Junior", SENIOR: "Senior", PHD: "PhD" };
export function planName(tier: string): string { return PLAN_NAME[tier] ?? tier; }

/** Quantos dias faltam (arredondado pra cima, mínimo 1): 3 dias exatos → 3; 2 dias e 1 hora → 3; 1 hora → 1. */
export function daysLeft(row: Pick<SubscriptionRow, "currentPeriodEnd">, now: Date): number {
  return Math.max(1, Math.ceil((row.currentPeriodEnd.getTime() - now.getTime()) / DAY_MS));
}

const willEndByChoice = (row: SubscriptionRow) => row.status === "ACTIVE" && row.cancelAtPeriodEnd;

/** Faltam de 0 (exclusive) a 3 dias (inclusive) para o fim do período. */
function inExpiryWindow(row: SubscriptionRow, now: Date): boolean {
  const left = row.currentPeriodEnd.getTime() - now.getTime();
  return left > 0 && left <= EXPIRY_WARNING_DAYS * DAY_MS;
}

/** Quais avisos de PUSH esta linha merece AGORA (antes do claim atômico, que garante "uma vez por período"). */
export function pushNoticeKinds(row: SubscriptionRow, now: Date): SubscriptionNoticeKind[] {
  if (row.status === "INCOMPLETE") return [];
  if (!isSubscriptionInForce(row, now)) {
    // CANCELED, ou PAST_DUE com o período vencido: já não vale (regra do ADR-0029) — só se for queda recente.
    return now.getTime() - row.currentPeriodEnd.getTime() <= DROPPED_PUSH_WINDOW_DAYS * DAY_MS ? ["DROPPED"] : [];
  }
  const kinds: SubscriptionNoticeKind[] = [];
  if (row.status === "PAST_DUE") kinds.push("PAST_DUE");
  if ((row.status === "PAST_DUE" || willEndByChoice(row)) && inExpiryWindow(row, now)) kinds.push("EXPIRING");
  return kinds;
}

/** `true` se este tipo de aviso já foi reivindicado para o período ATUAL da linha. */
export function alreadyNoticed(row: SubscriptionRow, kind: SubscriptionNoticeKind): boolean {
  const marked = row.noticeFor?.[kind];
  return !!marked && marked.getTime() === row.currentPeriodEnd.getTime();
}

const dayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone: GAME_TIME_ZONE, day: "2-digit", month: "2-digit" });

export interface NoticeCopy { title: string; body: string }

/** Título e corpo — os MESMOS no push e na faixa do app. */
export function noticeCopy(kind: SubscriptionNoticeKind, row: SubscriptionRow, now: Date): NoticeCopy {
  const plan = planName(row.tier);
  const end = dayMonth.format(row.currentPeriodEnd);
  if (kind === "EXPIRING") {
    const n = daysLeft(row, now);
    return {
      title: `Sua assinatura vence em ${n} ${n === 1 ? "dia" : "dias"}`,
      body: willEndByChoice(row)
        ? `Seu plano ${plan} não será renovado e termina em ${end}. Veja os planos para manter os benefícios.`
        : `Seu plano ${plan} termina em ${end} e o pagamento ainda não foi concluído. Atualize o pagamento para manter os benefícios.`,
    };
  }
  if (kind === "PAST_DUE") {
    return {
      title: "O pagamento da sua assinatura falhou",
      body: `Não conseguimos cobrar o plano ${plan}. Ele segue ativo até ${end}; se o pagamento não for resolvido, sua conta volta para o plano gratuito.`,
    };
  }
  return {
    title: "Sua conta voltou para o plano gratuito",
    body: `O plano ${plan} terminou. Assine de novo para recuperar os benefícios.`,
  };
}

// ── Faixa no app (GET /me/subscription-notice) ─────────────────────────────

export interface BannerNotice {
  kind: SubscriptionNoticeKind;
  subscriptionId: string;
  tier: string;
  /** ISO — fim do período da assinatura. */
  periodEnd: string;
  title: string;
  body: string;
  /** Chave para a web lembrar que o jogador dispensou ESTE aviso deste período (`tipo:assinatura:fim`). */
  dismissKey: string;
  /** Para onde a faixa leva. */
  url: string;
}

const PRIORITY: Record<SubscriptionNoticeKind, number> = { PAST_DUE: 3, EXPIRING: 2, DROPPED: 1 };

function bannerKind(row: SubscriptionRow, now: Date, effectiveTier: Tier): SubscriptionNoticeKind | null {
  if (row.status === "INCOMPLETE") return null;
  if (!isSubscriptionInForce(row, now)) {
    // Caiu de fato: só se o jogador está no Free (uma concessão válida o mantém acima do Free) e é recente.
    if (effectiveTier !== "FREE") return null;
    return now.getTime() - row.currentPeriodEnd.getTime() <= DROPPED_BANNER_DAYS * DAY_MS ? "DROPPED" : null;
  }
  if (row.status === "PAST_DUE") return "PAST_DUE";
  if (willEndByChoice(row) && inExpiryWindow(row, now)) return "EXPIRING";
  return null;
}

/**
 * Qual faixa mostrar (ou `null`). Some quando a assinatura volta a ficar ativa: se existe QUALQUER assinatura em
 * vigor, `ACTIVE` e sem cancelamento agendado (renovou / reativou / assinou de novo), não há faixa. Entre as demais,
 * vence a mais urgente: pagamento falhou > vence em breve > voltou para o gratuito.
 */
export function pickBannerNotice(rows: SubscriptionRow[], now: Date, effectiveTier: Tier): BannerNotice | null {
  if (rows.some((r) => isSubscriptionInForce(r, now) && r.status === "ACTIVE" && !r.cancelAtPeriodEnd)) return null;
  let best: { row: SubscriptionRow; kind: SubscriptionNoticeKind } | null = null;
  for (const row of rows) {
    const kind = bannerKind(row, now, effectiveTier);
    if (!kind) continue;
    if (!best || PRIORITY[kind] > PRIORITY[best.kind]
      || (PRIORITY[kind] === PRIORITY[best.kind] && row.currentPeriodEnd.getTime() > best.row.currentPeriodEnd.getTime())) best = { row, kind };
  }
  if (!best) return null;
  const { title, body } = noticeCopy(best.kind, best.row, now);
  const periodEnd = best.row.currentPeriodEnd.toISOString();
  return {
    kind: best.kind, subscriptionId: best.row.id, tier: best.row.tier, periodEnd, title, body,
    dismissKey: `${best.kind}:${best.row.id}:${periodEnd}`, url: NOTICE_URL,
  };
}
