/**
 * Planos de assinatura (economia — Stripe). `lookup_key` referencia o Price no
 * catálogo Stripe — nunca hardcode price_id, que muda entre sandbox e produção.
 * FREE não tem assinatura (é o tier padrão sem cobrança).
 */
import type { Tier } from "@genbreedai/shared";

export type SubscriptionInterval = "MONTH" | "YEAR";
export type PaidTier = "JUNIOR" | "SENIOR" | "PHD";

const LOOKUP_KEYS: Record<PaidTier, Record<SubscriptionInterval, string>> = {
  JUNIOR: { MONTH: "junior_mensal", YEAR: "junior_anual" },
  SENIOR: { MONTH: "senior_mensal", YEAR: "senior_anual" },
  PHD: { MONTH: "phd_mensal", YEAR: "phd_anual" },
};

export function isPaidTier(tier: string): tier is PaidTier {
  return tier === "JUNIOR" || tier === "SENIOR" || tier === "PHD";
}

/** Resolve o lookup_key Stripe do plano; undefined se tier/interval inválidos. */
export function subscriptionLookupKey(tier: Tier, interval: SubscriptionInterval): string | undefined {
  if (!isPaidTier(tier)) return undefined;
  return LOOKUP_KEYS[tier]?.[interval];
}
