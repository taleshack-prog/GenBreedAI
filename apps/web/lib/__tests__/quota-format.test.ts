/**
 * ADR-0020: cota de REVELAÇÃO (era cota de cruzamento, ADR-0019) — formatos
 * usados no Laboratório/Perfil/Incubadora e na mensagem de 429 de revelar.
 */
import { describe, it, expect } from "vitest";
import { revealQuotaLabel, revealUsageLabel, nextAvailableLabel } from "../quota-format";

describe("revealQuotaLabel", () => {
  it("FREE (1/rolling7d) — singular", () => {
    expect(revealQuotaLabel({ limit: 1, window: "rolling7d" })).toBe("1 revelação a cada 7 dias");
  });
  it("JUNIOR (3/rolling7d) — plural", () => {
    expect(revealQuotaLabel({ limit: 3, window: "rolling7d" })).toBe("3 revelações a cada 7 dias");
  });
  it("SENIOR (1/day)", () => {
    expect(revealQuotaLabel({ limit: 1, window: "day" })).toBe("1 por dia");
  });
  it("PHD (3/day)", () => {
    expect(revealQuotaLabel({ limit: 3, window: "day" })).toBe("3 por dia");
  });
});

describe("revealUsageLabel", () => {
  it("formata usado/limite (perfil, ADR-0020 item 3)", () => {
    expect(revealUsageLabel({ used: 0, limit: 1 })).toBe("Revelações: 0 de 1");
    expect(revealUsageLabel({ used: 2, limit: 3 })).toBe("Revelações: 2 de 3");
  });
});

describe("nextAvailableLabel", () => {
  it("null (ainda há cota) → null", () => {
    expect(nextAvailableLabel(null)).toBeNull();
  });
  it("ISO válido → 'Próxima revelação em <data e hora local>'", () => {
    const label = nextAvailableLabel("2026-09-24T17:00:00.000Z");
    expect(label).not.toBeNull();
    expect(label).toMatch(/^Próxima revelação em /);
    // Não fixa o horário exato (depende do fuso do runner) — só garante que
    // formatou como data+hora pt-BR (dd/mm/aaaa, hh:mm) em vez do ISO cru.
    expect(label).toMatch(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/);
    expect(label).not.toContain("2026-09-24T17:00:00.000Z");
  });
});
