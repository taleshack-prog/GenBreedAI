/**
 * Tela de indicação (ADR-0024, rev. 2) — textos e linhas de progresso, PUROS (sem DOM).
 *
 * Regra do produto: indicação só recompensa quando o indicado GASTA — assinatura (Junior +15 ·
 * Senior +30 · PhD 1 mês do plano do indicador) ou COMPRA DE PACOTES DE CRÉDITOS: a cada 3 pacotes
 * iguais comprados pelo MESMO indicado, o indicador ganha 2 (de 10), 5 (de 30) ou 10 (de 60)
 * créditos. Cada tamanho é um balde independente, o resto fica acumulado, sem limite de vezes.
 * Cadastro sozinho — ou indicado que fica no Free — nunca rende nada. Os valores dos trios vêm da
 * API (`packs[].reward`, fonte única); aqui não há tabela paralela de recompensa.
 */

/** Uma linha de `GET /referral` → `packs` (um tamanho de pacote, somando os indicados). */
export interface ReferralPackProgress {
  packId: string;
  /** Créditos do pacote (10 / 30 / 60). */
  credits: number;
  label: string;
  /** Créditos que o indicador ganha por trio fechado. */
  reward: number;
  /** Pacotes deste tamanho comprados por todos os indicados. */
  purchased: number;
  /** Trios já pagos. */
  triosPaid: number;
  /** 0..2 — quanto o indicado MAIS adiantado já acumulou rumo ao próximo trio. */
  bestProgress: number;
  /** Quantos pacotes faltam, pra esse indicado, fechar o próximo trio. */
  missing: number;
}

export const DEFAULT_TRIO_SIZE = 3;

export const REFERRAL_INTRO =
  "Compartilhe seu link. Você só é recompensado quando quem entrou por ele GASTA: assinando um plano ou comprando pacotes de créditos. Só se cadastrar — ou ficar no plano Free — não rende nada.";
export const REFERRAL_SUBSCRIPTION_RULE =
  "Assinatura: Junior +15 créditos · Senior +30 · PhD 1 mês grátis do seu plano (quem é Free ganha 1 mês de Junior).";

/** "3 × 10 → +2 · 3 × 30 → +5 · 3 × 60 → +10" — montado dos valores da API. */
export function packRewardsText(packs: readonly ReferralPackProgress[], trioSize = DEFAULT_TRIO_SIZE): string {
  return packs.map((p) => `${trioSize} × ${p.credits} → +${p.reward}`).join(" · ");
}

/** Regra dos pacotes, completa e curta. */
export function referralPackRule(packs: readonly ReferralPackProgress[], trioSize = DEFAULT_TRIO_SIZE): string {
  return `Pacotes de créditos: a cada ${trioSize} pacotes iguais comprados pelo MESMO indicado você ganha créditos (${packRewardsText(packs, trioSize)}). Cada tamanho conta à parte, o que sobra fica acumulado para o próximo trio e não há limite de vezes.`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "falta 1 pacote" / "faltam 2 pacotes". */
export function missingText(missing: number): string {
  return `${missing === 1 ? "falta" : "faltam"} ${plural(missing, "pacote", "pacotes")}`;
}

/**
 * O que falta pro próximo trio. Compras de indicados diferentes NÃO se somam, então o "mais adiantado"
 * é o indicado mais perto de fechar.
 */
export function nextTrioText(p: ReferralPackProgress, trioSize = DEFAULT_TRIO_SIZE): string {
  if (p.bestProgress <= 0) return `próximo trio: ${missingText(trioSize)} do mesmo indicado`;
  return `próximo trio: o indicado mais adiantado tem ${p.bestProgress} de ${trioSize} — ${missingText(p.missing)}`;
}

export interface ReferralPackLine {
  /** "Pacote de 10 créditos" */
  title: string;
  /** "6 comprados pelos indicados · 1 trio pago (+2 créditos)" */
  stats: string;
  /** "próximo trio: …" */
  next: string;
}

export function referralPackLine(p: ReferralPackProgress, trioSize = DEFAULT_TRIO_SIZE): ReferralPackLine {
  return {
    title: `Pacote de ${p.credits} créditos`,
    stats: `${plural(p.purchased, "comprado", "comprados")} pelos indicados · ${plural(p.triosPaid, "trio pago", "trios pagos")} (+${p.triosPaid * p.reward} créditos)`,
    next: nextTrioText(p, trioSize),
  };
}
