/**
 * Faixa de aviso de assinatura (ADR-0030) — lógica PURA (sem DOM). A API decide QUANDO mostrar e devolve título e
 * corpo prontos (`GET /me/subscription-notice`, os mesmos textos do push); aqui só: dispensar (lembrado por aviso e
 * por período), quando buscar de novo e o tom da faixa. Os três casos: vence em até 3 dias / o pagamento falhou /
 * voltou para o plano gratuito. Some sozinha quando a assinatura volta a ficar ativa (a API devolve `notice: null`).
 */
import type { StorageLike } from "./referral-capture";

export type SubscriptionNoticeKind = "EXPIRING" | "PAST_DUE" | "DROPPED";

/** Resposta de `GET /me/subscription-notice` → `notice`. */
export interface SubscriptionNotice {
  kind: SubscriptionNoticeKind;
  subscriptionId: string;
  tier: string;
  /** ISO — fim do período da assinatura. */
  periodEnd: string;
  title: string;
  body: string;
  /** `tipo:assinatura:fim-do-período` — dispensar vale só para ESTE aviso deste período; um aviso novo reaparece. */
  dismissKey: string;
  /** Página de planos. */
  url: string;
}

export const BANNER_LINK_LABEL = "Ver planos";
export const BANNER_DISMISS_LABEL = "Dispensar aviso";
export const DISMISSED_STORAGE_KEY = "gb:sub-notice-dismissed";
/** Só guarda as últimas N chaves dispensadas (nunca cresce sem limite). */
export const MAX_DISMISSED = 20;
/** Não busca a faixa de novo em menos de 1 minuto (navegar entre telas não vira uma requisição por toque). */
export const BANNER_REFETCH_MIN_MS = 60_000;

/** Lê a lista de chaves dispensadas; qualquer coisa estranha no storage vira lista vazia (nunca lança). */
export function readDismissed(storage: StorageLike): string[] {
  try {
    const raw = storage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

export function isDismissed(storage: StorageLike, key: string): boolean {
  return readDismissed(storage).includes(key);
}

/** Lembra que este aviso deste período foi dispensado (storage bloqueado: só não lembra). */
export function dismissNotice(storage: StorageLike, key: string): void {
  try {
    const next = [...readDismissed(storage).filter((k) => k !== key), key].slice(-MAX_DISMISSED);
    storage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(next));
  } catch { /* sem storage: a faixa volta na próxima abertura — aceitável */ }
}

/** Mostra a faixa quando há aviso E ele não foi dispensado. */
export function shouldShowBanner(notice: SubscriptionNotice | null, storage: StorageLike): boolean {
  return notice !== null && !isDismissed(storage, notice.dismissKey);
}

/** `true` se já passou tempo suficiente desde a última busca (ou nunca buscou). */
export function shouldRefetch(lastFetchMs: number | null, nowMs: number, minMs: number = BANNER_REFETCH_MIN_MS): boolean {
  return lastFetchMs === null || nowMs - lastFetchMs >= minMs;
}

/** Tom da faixa: pagamento falhou e "voltou para o gratuito" pedem ação (vermelho/âmbar); "vence em breve" é aviso. */
export function bannerTone(kind: SubscriptionNoticeKind): "crit" | "warn" {
  return kind === "PAST_DUE" || kind === "DROPPED" ? "crit" : "warn";
}
