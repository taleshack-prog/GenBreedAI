/**
 * Cotas por tier (ADR-0019, renomeado pela ADR-0020 — incubadora: cruzar é
 * livre, REVELAR consome cota).
 * REGRA ANTI-P2W: o tier afeta EXCLUSIVAMENTE cota de revelação, retratos
 * extras, pool de espécies e ferramentas — NUNCA as probabilidades do motor.
 * Este mapa é a única autoridade sobre limites; o motor nunca o consulta.
 */

import type { Tier } from "@genbreedai/shared";

/**
 * Cota de REVELAÇÃO (ADR-0020 — antes "cota de cruzamento", ADR-0019; mesmos
 * valores/janelas, só o alvo mudou de "cruzar" pra "revelar uma descrição já
 * incubada"): "rolling7d" = N revelações nos últimos 7×24h corridas (janela
 * móvel, sem "virar" num horário fixo); "day" = N revelações por DIA CIVIL em
 * America/Sao_Paulo (vira à meia-noite local).
 */
export interface RevealQuotaPolicy {
  limit: number;
  window: "rolling7d" | "day";
}

export interface TierPolicy {
  /** Cota de REVELAÇÃO — ADR-0020 (era `crossQuota`, ADR-0019). */
  revealQuota: RevealQuotaPolicy;
  /**
   * Retratos EXTRAS por mês (regenerar um retrato já revelado) — NÃO conta a
   * primeira revelação de uma descrição (essa é a `revealQuota` acima).
   * Esgotado → créditos avulsos.
   */
  monthlyExtraImages: number;
  /** Bônus semanal (+1 crédito de imagem) liberado a partir deste tier (ADR-0019). */
  weeklyBonus: boolean;
  /** Profundidade de árvore genealógica exposta pela API (TDD §8). */
  lineageDepth: number | "full";
  /** Acesso ao mercado (exclusivo PhD, TDD §7.4). */
  marketAccess: boolean;
  /**
   * Limite TÉCNICO (anti-abuso, invisível no jogo, ADR-0020) de chamadas a
   * POST /api/v1/cross por hora — cruzar é livre/sem custo pro jogador, mas
   * ainda precisa de um teto contra automação/spam. Igual pra todo tier de
   * propósito (não é uma vantagem de tier, é proteção de infraestrutura).
   */
  hourlyCrossLimit: number;
}

export const TIER_POLICIES: Record<Tier, TierPolicy> = {
  FREE: { revealQuota: { limit: 1, window: "rolling7d" }, monthlyExtraImages: 0, weeklyBonus: false, lineageDepth: 1, marketAccess: false, hourlyCrossLimit: 60 },
  JUNIOR: { revealQuota: { limit: 3, window: "rolling7d" }, monthlyExtraImages: 0, weeklyBonus: true, lineageDepth: 3, marketAccess: false, hourlyCrossLimit: 60 },
  SENIOR: { revealQuota: { limit: 1, window: "day" }, monthlyExtraImages: 15, weeklyBonus: true, lineageDepth: 7, marketAccess: false, hourlyCrossLimit: 60 },
  PHD: { revealQuota: { limit: 3, window: "day" }, monthlyExtraImages: 20, weeklyBonus: true, lineageDepth: "full", marketAccess: true, hourlyCrossLimit: 60 },
};

export function tierPolicy(tier: Tier): TierPolicy {
  return TIER_POLICIES[tier];
}
