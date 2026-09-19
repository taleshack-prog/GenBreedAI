/**
 * Tempo de gestação por aura (ADR-0021, item literal do pedido). Regra de
 * produto/monetização — NÃO é genética, então fica na API, nunca em
 * `packages/engine` (motor é puro/determinístico sobre genótipo, não sabe
 * de pacing comercial).
 *
 * Tabela EXATA pedida — nenhum valor interpolado ou inventado fora dela
 * (CLAUDE.md §2, regra 1: não invente valores fora das tabelas de origem).
 */
export const GESTATION_HOURS_BY_AURA: Readonly<Record<number, number>> = {
  1: 12,
  2: 18,
  3: 24,
  4: 36,
  5: 48,
};

/**
 * Aura sempre vem de `mapFixationToAura` (packages/engine), que só produz
 * 1-5 por construção — um valor fora disso é um bug em outro lugar, não algo
 * pra este código "consertar" silenciosamente com um default inventado.
 * Lança em vez de inventar (CLAUDE.md §2, regra 1).
 */
export function gestationHoursForAura(aura: number): number {
  const hours = GESTATION_HOURS_BY_AURA[aura];
  if (hours === undefined) {
    throw new Error(`aura fora da faixa 1-5 suportada pela tabela de gestação (ADR-0021): ${aura}`);
  }
  return hours;
}

export function gestationEndFor(aura: number, startedAt: Date): Date {
  const hours = gestationHoursForAura(aura);
  return new Date(startedAt.getTime() + hours * 60 * 60 * 1000);
}

/**
 * ADR-0025 — a PRIMEIRA gestação de cada conta dura 5 minutos, qualquer que
 * seja a aura (cortesia de boas-vindas: o jogador novo decide se fica nas
 * primeiras horas). Uma vez por conta, não por cruzamento; quem decide se é a
 * primeira é a marca `users.first_gestation_at` (`UserRepository`), não esta
 * função. As seguintes usam a tabela por aura acima. Só pacing — nunca toca o
 * resultado genético (anti-P2W, igual para todo tier).
 */
export const FIRST_GESTATION_MINUTES = 5;

export function firstGestationEndFor(startedAt: Date): Date {
  return new Date(startedAt.getTime() + FIRST_GESTATION_MINUTES * 60 * 1000);
}
