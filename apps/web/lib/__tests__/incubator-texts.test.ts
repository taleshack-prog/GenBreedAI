/**
 * Texto da confirmação de descarte (item 4 do pedido) — coberto sem DOM: é
 * uma constante pura, então basta conferir o valor exato (o componente só
 * passa isto pra `window.confirm`, que não há necessidade nem como testar
 * de forma útil em jsdom — sempre resolve `true`/`false` sem renderizar
 * nada; o que importa testar é o TEXTO em si).
 */
import { describe, it, expect } from "vitest";
import { DISCARD_CONFIRM_TEXT } from "../incubator-texts";

describe("DISCARD_CONFIRM_TEXT", () => {
  it("é exatamente o texto pedido", () => {
    expect(DISCARD_CONFIRM_TEXT).toBe(
      "Esta descrição será perdida. Você pode gestá-la depois, sem pressa — a incubadora não tem prazo. Descartar mesmo assim?",
    );
  });
});
