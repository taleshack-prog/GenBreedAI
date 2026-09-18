/**
 * Textos fixos da tela da incubadora que precisam ser testáveis sem DOM
 * (ex.: confirmação de `window.confirm`, que o jsdom não expõe de um jeito
 * fácil de asserir — extraído pra constante em vez de string inline no
 * componente, pra um teste puro poder conferir o texto exato).
 */

/** Confirmação antes de descartar uma descrição NA_INCUBADORA (ADR-0021). */
export const DISCARD_CONFIRM_TEXT =
  "Esta descrição será perdida. Você pode gestá-la depois, sem pressa — a incubadora não tem prazo. Descartar mesmo assim?";
