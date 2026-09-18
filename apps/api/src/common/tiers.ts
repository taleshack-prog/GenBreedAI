/**
 * Cotas por tier (ADR-0019 → ADR-0020 "revelar" → ADR-0021 "gestar" — o
 * nome do gate muda a cada revisão de produto, mesmos valores/janelas desde
 * a ADR-0019; ADR-0021: o único custo real é a imagem gerada no NASCIMENTO,
 * então o limite passou a ficar em GESTAR, não mais em revelar).
 * REGRA ANTI-P2W: o tier afeta EXCLUSIVAMENTE cota de gestação, retratos
 * extras, pool de espécies e ferramentas — NUNCA as probabilidades do motor.
 * Este mapa é a única autoridade sobre limites; o motor nunca o consulta.
 */

import type { Tier } from "@genbreedai/shared";

/**
 * Vagas de GESTAÇÃO (ADR-0021 — era `revealQuota`, ADR-0020; mesmos
 * valores/janelas, só o alvo mudou de "revelar uma descrição" pra "iniciar
 * a gestação de uma descrição"): "rolling7d" = N gestações iniciadas nos
 * últimos 7×24h corridas (janela móvel); "day" = N gestações por DIA CIVIL
 * em America/Sao_Paulo (vira à meia-noite local).
 */
export interface BirthQuotaPolicy {
  limit: number;
  window: "rolling7d" | "day";
}

export interface TierPolicy {
  /** Vagas de gestação — ADR-0021 (era `revealQuota`, ADR-0020). */
  birthQuota: BirthQuotaPolicy;
  /**
   * Retratos EXTRAS por mês (regenerar o retrato de um espécime já
   * nascido) — NÃO conta o retrato do nascimento em si (esse é grátis,
   * pago pela vaga de gestação). Esgotado → créditos avulsos.
   */
  monthlyExtraImages: number;
  /** Bônus QUINZENAL (+1 crédito de imagem) liberado a partir deste tier (ADR-0021 — era semanal, ADR-0019). */
  biweeklyBonus: boolean;
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
  FREE: { birthQuota: { limit: 1, window: "rolling7d" }, monthlyExtraImages: 0, biweeklyBonus: false, lineageDepth: 1, marketAccess: false, hourlyCrossLimit: 60 },
  JUNIOR: { birthQuota: { limit: 3, window: "rolling7d" }, monthlyExtraImages: 0, biweeklyBonus: true, lineageDepth: 3, marketAccess: false, hourlyCrossLimit: 60 },
  SENIOR: { birthQuota: { limit: 1, window: "day" }, monthlyExtraImages: 15, biweeklyBonus: true, lineageDepth: 7, marketAccess: false, hourlyCrossLimit: 60 },
  PHD: { birthQuota: { limit: 3, window: "day" }, monthlyExtraImages: 20, biweeklyBonus: true, lineageDepth: "full", marketAccess: true, hourlyCrossLimit: 60 },
};

export function tierPolicy(tier: Tier): TierPolicy {
  return TIER_POLICIES[tier];
}
