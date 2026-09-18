/**
 * Tempo de gestação por aura (ADR-0021, item 9: "tempo por aura correto nas
 * 5 faixas").
 */
import { describe, it, expect } from "vitest";
import { GESTATION_HOURS_BY_AURA, gestationHoursForAura, gestationEndFor } from "../src/incubator/gestation-time";

describe("gestationHoursForAura — tabela exata pedida (ADR-0021)", () => {
  it.each([
    [1, 12], [2, 18], [3, 24], [4, 36], [5, 48],
  ])("aura %i → %i horas", (aura, hours) => {
    expect(gestationHoursForAura(aura)).toBe(hours);
    expect(GESTATION_HOURS_BY_AURA[aura]).toBe(hours);
  });

  it("aura fora de 1-5 lança (nunca inventa um valor default)", () => {
    expect(() => gestationHoursForAura(0)).toThrow();
    expect(() => gestationHoursForAura(6)).toThrow();
    expect(() => gestationHoursForAura(-1)).toThrow();
  });

  it("gestationEndFor soma as horas certas ao instante de início", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    expect(gestationEndFor(1, start).toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(gestationEndFor(5, start).toISOString()).toBe("2026-01-03T00:00:00.000Z");
  });
});
