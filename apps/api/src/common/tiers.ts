/**
 * Cotas por tier (ADR-0019 — substitui dailyCrosses/monthlyPremiumImages).
 * REGRA ANTI-P2W: o tier afeta EXCLUSIVAMENTE cota de cruzamento, retratos
 * extras, pool de espécies e ferramentas — NUNCA as probabilidades do motor.
 * Este mapa é a única autoridade sobre limites; o motor nunca o consulta.
 */

import type { Tier } from "@genbreedai/shared";

/**
 * Cota de cruzamento (ADR-0019): "rolling7d" = N cruzamentos nos últimos
 * 7×24h corridas (janela móvel, sem "virar" num horário fixo); "day" = N
 * cruzamentos por DIA CIVIL em America/Sao_Paulo (vira à meia-noite local).
 */
export interface CrossQuotaPolicy {
  limit: number;
  window: "rolling7d" | "day";
}

export interface TierPolicy {
  /** Cota de cruzamento (ADR-0019). */
  crossQuota: CrossQuotaPolicy;
  /**
   * Retratos EXTRAS por mês (prévias de fenótipo + regenerar) — NÃO conta o
   * retrato que já vem incluído em todo cruzamento (ADR-0019). Esgotado →
   * créditos avulsos.
   */
  monthlyExtraImages: number;
  /** Bônus semanal (+1 crédito de imagem) liberado a partir deste tier (ADR-0019). */
  weeklyBonus: boolean;
  /** Profundidade de árvore genealógica exposta pela API (TDD §8). */
  lineageDepth: number | "full";
  /** Acesso ao mercado (exclusivo PhD, TDD §7.4). */
  marketAccess: boolean;
}

export const TIER_POLICIES: Record<Tier, TierPolicy> = {
  FREE: { crossQuota: { limit: 1, window: "rolling7d" }, monthlyExtraImages: 0, weeklyBonus: false, lineageDepth: 1, marketAccess: false },
  JUNIOR: { crossQuota: { limit: 3, window: "rolling7d" }, monthlyExtraImages: 0, weeklyBonus: true, lineageDepth: 3, marketAccess: false },
  SENIOR: { crossQuota: { limit: 1, window: "day" }, monthlyExtraImages: 15, weeklyBonus: true, lineageDepth: 7, marketAccess: false },
  PHD: { crossQuota: { limit: 3, window: "day" }, monthlyExtraImages: 20, weeklyBonus: true, lineageDepth: "full", marketAccess: true },
};

export function tierPolicy(tier: Tier): TierPolicy {
  return TIER_POLICIES[tier];
}
