/**
 * Tempo de gestação por aura e tempo restante (ADR-0021, item 8 do pedido).
 */
import { describe, it, expect } from "vitest";
import { gestationHoursForAura, gestationRemainingLabel, isGestationReady, GESTATION_HOURS_BY_AURA } from "../gestation";

describe("gestationHoursForAura — tabela exata (ADR-0021), igual à API", () => {
  it.each([
    [1, 12], [2, 18], [3, 24], [4, 36], [5, 48],
  ])("aura %i → %i horas", (aura, hours) => {
    expect(gestationHoursForAura(aura)).toBe(hours);
    expect(GESTATION_HOURS_BY_AURA[aura]).toBe(hours);
  });

  it("aura fora de 1-5 lança (nunca inventa um valor default)", () => {
    expect(() => gestationHoursForAura(0)).toThrow();
    expect(() => gestationHoursForAura(6)).toThrow();
  });
});

describe("gestationRemainingLabel", () => {
  it("horas e minutos restantes", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-01T11:32:00Z").toISOString();
    expect(gestationRemainingLabel(end, now)).toBe("11h 32min restantes");
  });

  it("só minutos quando falta menos de 1h", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-01T00:45:00Z").toISOString();
    expect(gestationRemainingLabel(end, now)).toBe("45min restantes");
  });

  it("prazo já vencido → 'Pronto para nascer!'", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const end = new Date("2026-01-01T00:00:00Z").toISOString();
    expect(gestationRemainingLabel(end, now)).toBe("Pronto para nascer!");
  });

  it("exatamente no instante do prazo → 'Pronto para nascer!' (não '0min restantes')", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(gestationRemainingLabel(now.toISOString(), now)).toBe("Pronto para nascer!");
  });
});

describe("isGestationReady", () => {
  it("antes do prazo → false", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isGestationReady(new Date("2026-01-01T01:00:00Z").toISOString(), now)).toBe(false);
  });
  it("depois do prazo → true", () => {
    const now = new Date("2026-01-01T02:00:00Z");
    expect(isGestationReady(new Date("2026-01-01T01:00:00Z").toISOString(), now)).toBe(true);
  });
});
