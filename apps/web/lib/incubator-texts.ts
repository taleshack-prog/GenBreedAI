/**
 * Textos fixos da tela da incubadora que precisam ser testáveis sem DOM
 * (ex.: confirmação de `window.confirm`, que o jsdom não expõe de um jeito
 * fácil de asserir — extraído pra constante em vez de string inline no
 * componente, pra um teste puro poder conferir o texto exato).
 */

import {
  FIRST_GESTATION_MINUTES, GESTATION_MIN_HOURS, GESTATION_MAX_HOURS, gestationHoursForAura,
} from "./gestation";

/** ADR-0025 — antes de gestar, quando a cortesia da 1ª gestação da conta ainda está disponível (no lugar do tempo da aura). */
export const FIRST_GESTATION_BEFORE_TEXT = `Primeira gestação acelerada: ${FIRST_GESTATION_MINUTES} minutos`;

/** ADR-0025 — no card em gestação da 1ª gestação: explica o prazo curto e avisa das próximas. */
export const FIRST_GESTATION_DURING_TEXT =
  `Primeira gestação acelerada. As próximas levam de ${GESTATION_MIN_HOURS}h a ${GESTATION_MAX_HOURS}h.`;

/**
 * Linha de tempo de gestação ANTES de gestar: a cortesia (5 min) enquanto a
 * conta ainda não usou a primeira; a partir da segunda, o tempo da aura
 * ("Gestação: 24h"), como sempre.
 */
export function gestationPreviewLabel(aura: number, firstGestationAvailable: boolean): string {
  return firstGestationAvailable ? FIRST_GESTATION_BEFORE_TEXT : `Gestação: ${gestationHoursForAura(aura)}h`;
}

/** Confirmação antes de descartar uma descrição NA_INCUBADORA (ADR-0021). */
export const DISCARD_CONFIRM_TEXT =
  "Esta descrição será perdida. Você pode gestá-la depois, sem pressa — a incubadora não tem prazo. Descartar mesmo assim?";
