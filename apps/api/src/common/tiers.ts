/**
 * Cotas por tier (TDD §6). REGRA ANTI-P2W: o tier afeta EXCLUSIVAMENTE cota
 * diária, pool de espécies e ferramentas — NUNCA as probabilidades do motor.
 * Este mapa é a única autoridade sobre limites; o motor nunca o consulta.
 */

import type { Tier } from "@genbreedai/shared";

export interface TierPolicy {
  /** Cruzamentos por dia (TDD §6). */
  dailyCrosses: number;
  /** Imagens IA premium por mês (TDD §6). */
  monthlyPremiumImages: number;
  /** Profundidade de árvore genealógica exposta pela API (TDD §8). */
  lineageDepth: number | "full";
  /** Acesso ao mercado (exclusivo PhD, TDD §7.4). */
  marketAccess: boolean;
}

export const TIER_POLICIES: Record<Tier, TierPolicy> = {
  FREE: { dailyCrosses: 1, monthlyPremiumImages: 1, lineageDepth: 1, marketAccess: false },
  JUNIOR: { dailyCrosses: 3, monthlyPremiumImages: 6, lineageDepth: 3, marketAccess: false },
  SENIOR: { dailyCrosses: 5, monthlyPremiumImages: 10, lineageDepth: 7, marketAccess: false },
  PHD: { dailyCrosses: 10, monthlyPremiumImages: 20, lineageDepth: "full", marketAccess: true },
};

export function tierPolicy(tier: Tier): TierPolicy {
  return TIER_POLICIES[tier];
}
