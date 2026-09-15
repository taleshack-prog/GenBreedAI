/**
 * Taxonomia explícita (ADR-0015, Etapa 2c, item 1). Testa `biologicalSpecies()`
 * de @genbreedai/shared — não há infraestrutura de teste em packages/shared
 * hoje (sem vitest configurado lá); packages/engine já depende do pacote e já
 * tem vitest, então o teste de unidade da função fica aqui (decisão
 * conservadora, registrada no commit).
 */
import { describe, it, expect } from "vitest";
import { biologicalSpecies, SPECIES_INFO } from "@genbreedai/shared";

describe("biologicalSpecies() — taxonomia explícita (ADR-0015)", () => {
  it("morfos de cor do tigre são a MESMA espécie biológica", () => {
    const bengala = biologicalSpecies("feline", "panthera-tigris");
    const branco = biologicalSpecies("feline", "panthera-tigris-branco");
    const albino = biologicalSpecies("feline", "panthera-tigris-albino");
    expect(bengala).toBe("panthera-tigris");
    expect(branco).toBe(bengala);
    expect(albino).toBe(bengala);
  });

  it("espécies felinas realmente distintas continuam distintas", () => {
    expect(biologicalSpecies("feline", "panthera-onca")).not.toBe(biologicalSpecies("feline", "puma"));
    expect(biologicalSpecies("feline", "panthera-leo")).not.toBe(biologicalSpecies("feline", "panthera-tigris"));
  });

  it("caninos: toda raça é canis-familiaris, independente do slug", () => {
    expect(biologicalSpecies("canine", "boerboel")).toBe("canis-familiaris");
    expect(biologicalSpecies("canine", "braco-alemao")).toBe("canis-familiaris");
    // Raça sem entrada em SPECIES_INFO (só existe em DOG_BREEDS) — ainda colapsa.
    expect(biologicalSpecies("canine", "dobermann")).toBe("canis-familiaris");
  });

  it("SPECIES_INFO expõe genus/subfamily pros felinos usados no catálogo", () => {
    expect(SPECIES_INFO["panthera-onca"]!.genus).toBe("Panthera");
    expect(SPECIES_INFO["panthera-onca"]!.subfamily).toBe("PANTHERINAE");
    expect(SPECIES_INFO.puma!.genus).toBe("Puma");
    expect(SPECIES_INFO.puma!.subfamily).toBe("FELINAE");
  });
});
