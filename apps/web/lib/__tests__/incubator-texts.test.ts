/**
 * Texto da confirmação de descarte (item 4 do pedido) — coberto sem DOM: é
 * uma constante pura, então basta conferir o valor exato (o componente só
 * passa isto pra `window.confirm`, que não há necessidade nem como testar
 * de forma útil em jsdom — sempre resolve `true`/`false` sem renderizar
 * nada; o que importa testar é o TEXTO em si).
 */
import { describe, it, expect } from "vitest";
import { DISCARD_CONFIRM_TEXT, FIRST_GESTATION_BEFORE_TEXT, FIRST_GESTATION_DURING_TEXT, gestationPreviewLabel } from "../incubator-texts";
import { FIRST_GESTATION_MINUTES, GESTATION_MIN_HOURS, GESTATION_MAX_HOURS } from "../gestation";

describe("primeira gestação acelerada (ADR-0025)", () => {
  it("textos exatos pedidos", () => {
    expect(FIRST_GESTATION_MINUTES).toBe(5);
    expect(FIRST_GESTATION_BEFORE_TEXT).toBe("Primeira gestação acelerada: 5 minutos");
    expect(FIRST_GESTATION_DURING_TEXT).toBe("Primeira gestação acelerada. As próximas levam de 12h a 48h.");
    expect([GESTATION_MIN_HOURS, GESTATION_MAX_HOURS]).toEqual([12, 48]);
  });

  it("antes de gestar: com a cortesia disponível mostra os 5 minutos (qualquer aura), no lugar do tempo da aura", () => {
    for (const aura of [1, 2, 3, 4, 5]) {
      expect(gestationPreviewLabel(aura, true)).toBe("Primeira gestação acelerada: 5 minutos");
    }
  });

  it("a partir da segunda: o tempo da aura continua sendo mostrado normalmente", () => {
    expect(gestationPreviewLabel(1, false)).toBe("Gestação: 12h");
    expect(gestationPreviewLabel(3, false)).toBe("Gestação: 24h");
    expect(gestationPreviewLabel(5, false)).toBe("Gestação: 48h");
  });
});

describe("DISCARD_CONFIRM_TEXT", () => {
  it("é exatamente o texto pedido", () => {
    expect(DISCARD_CONFIRM_TEXT).toBe(
      "Esta descrição será perdida. Você pode gestá-la depois, sem pressa — a incubadora não tem prazo. Descartar mesmo assim?",
    );
  });
});
