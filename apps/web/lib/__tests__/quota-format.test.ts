/**
 * ADR-0021: cota de NASCIMENTO (era cota de revelação, ADR-0020; era cota de
 * cruzamento, ADR-0019) — formatos usados no Laboratório/Perfil/Incubadora e
 * na mensagem de 429 de gestar.
 */
import { describe, it, expect } from "vitest";
import { birthQuotaLabel, birthUsageLabel, nextAvailableLabel } from "../quota-format";

describe("birthQuotaLabel", () => {
  it("FREE (1/rolling7d) — singular", () => {
    expect(birthQuotaLabel({ limit: 1, window: "rolling7d" })).toBe("1 nascimento a cada 7 dias");
  });
  it("JUNIOR (3/rolling7d) — plural", () => {
    expect(birthQuotaLabel({ limit: 3, window: "rolling7d" })).toBe("3 nascimentos a cada 7 dias");
  });
  it("SENIOR (1/day)", () => {
    expect(birthQuotaLabel({ limit: 1, window: "day" })).toBe("1 por dia");
  });
  it("PHD (3/day)", () => {
    expect(birthQuotaLabel({ limit: 3, window: "day" })).toBe("3 por dia");
  });
});

describe("birthUsageLabel", () => {
  it("formata usado/limite (perfil, ADR-0021 item 4)", () => {
    expect(birthUsageLabel({ used: 0, limit: 1 })).toBe("Nascimentos: 0 de 1");
    expect(birthUsageLabel({ used: 2, limit: 3 })).toBe("Nascimentos: 2 de 3");
  });
});

describe("nextAvailableLabel", () => {
  it("null (ainda há vaga) → null", () => {
    expect(nextAvailableLabel(null)).toBeNull();
  });
  it("ISO válido → 'Próxima vaga em <data e hora local>'", () => {
    const label = nextAvailableLabel("2026-09-24T17:00:00.000Z");
    expect(label).not.toBeNull();
    expect(label).toMatch(/^Próxima vaga em /);
    // Não fixa o horário exato (depende do fuso do runner) — só garante que
    // formatou como data+hora pt-BR (dd/mm/aaaa, hh:mm) em vez do ISO cru.
    expect(label).toMatch(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/);
    expect(label).not.toContain("2026-09-24T17:00:00.000Z");
  });
});
