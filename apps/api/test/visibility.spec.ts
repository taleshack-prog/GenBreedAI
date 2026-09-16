import { describe, it, expect } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { normalizeBiologicalSpecies, speciesInfo, resolveDisplayName, resolveScientificName, WILD_FELINE_FOUNDER_NAMES } from "@genbreedai/shared";
import { familyVisibleAtTier, specimenVisibleAtTier, assertTierAllows } from "../src/common/tier-access";
import { isInterspecific } from "../src/cross/cross.service";
import type { StoredSpecimen } from "../src/specimens/in-memory.repository";

describe("Visibilidade por tier (esconder cães do Free)", () => {
  it("FREE vê felinos, NÃO vê caninos", () => {
    expect(familyVisibleAtTier("FREE", "feline")).toBe(true);
    expect(familyVisibleAtTier("FREE", "canine")).toBe(false);
  });
  it("SENIOR vê caninos", () => {
    expect(familyVisibleAtTier("SENIOR", "canine")).toBe(true);
  });
});

describe("Pool de espécie por tier (ADR-0016)", () => {
  it("FREE vê gato doméstico (DOMESTIC_CAT)", () => {
    expect(specimenVisibleAtTier("FREE", "feline", "felis-catus")).toBe(true);
  });

  it("FREE NÃO vê felino selvagem (WILD_FELINE) — nem intraespécie", () => {
    // Onça×onça é INTRAESPÉCIE (mesma biologicalSpecies), mas onça é
    // WILD_FELINE — o pool bloqueia por ESPÉCIE, não por interespecificidade.
    expect(specimenVisibleAtTier("FREE", "feline", "panthera-onca")).toBe(false);
  });

  it("TESTE OBRIGATÓRIO: FREE não vê tigre-de-bengala × tigre-branco (intraespécie, mas WILD_FELINE)", () => {
    // panthera-tigris e panthera-tigris-branco são a MESMA biologicalSpecies
    // (ADR-0015, item 1) — não é um cruzamento interespecífico. Ainda assim,
    // FREE não pode ver NEM cruzar nenhum dos dois: WILD_FELINE exige JUNIOR+.
    expect(specimenVisibleAtTier("FREE", "feline", "panthera-tigris")).toBe(false);
    expect(specimenVisibleAtTier("FREE", "feline", "panthera-tigris-branco")).toBe(false);
    // JUNIOR já libera os dois.
    expect(specimenVisibleAtTier("JUNIOR", "feline", "panthera-tigris")).toBe(true);
    expect(specimenVisibleAtTier("JUNIOR", "feline", "panthera-tigris-branco")).toBe(true);
  });

  it("JUNIOR vê felino selvagem, mas ainda NÃO vê canino (SENIOR+)", () => {
    expect(specimenVisibleAtTier("JUNIOR", "feline", "panthera-onca")).toBe(true);
    expect(specimenVisibleAtTier("JUNIOR", "canine", "canis-familiaris")).toBe(false);
  });

  it("SENIOR vê canino (DOG, mesmo mínimo de sempre da família)", () => {
    expect(specimenVisibleAtTier("SENIOR", "canine", "boerboel")).toBe(true);
  });

  it("espécie sem poolGroup cadastrado cai pro mínimo de família (não inventa restrição extra)", () => {
    // Raça canina que só existe em DOG_BREEDS, não em SPECIES_INFO.
    expect(specimenVisibleAtTier("SENIOR", "canine", "dobermann")).toBe(true);
    expect(specimenVisibleAtTier("JUNIOR", "canine", "dobermann")).toBe(false); // família canina ainda exige SENIOR
  });

  it("CORREÇÃO (pós-commit 7c89ca0): FREE NÃO vê híbrido selvagem×selvagem por slug composto (fail-closed por componente)", () => {
    expect(specimenVisibleAtTier("FREE", "feline", "panthera-uncia×panthera-tigris-albino")).toBe(false);
    expect(specimenVisibleAtTier("JUNIOR", "feline", "panthera-uncia×panthera-tigris-albino")).toBe(true);
  });

  it("CORREÇÃO: FREE NÃO vê híbrido doméstico×selvagem por slug composto (basta 1 componente WILD_FELINE)", () => {
    expect(specimenVisibleAtTier("FREE", "feline", "felis-catus×leptailurus-serval")).toBe(false);
    expect(specimenVisibleAtTier("JUNIOR", "feline", "felis-catus×leptailurus-serval")).toBe(true);
  });

  it("FREE vê gato doméstico puro (slug simples, sem 'x')", () => {
    expect(specimenVisibleAtTier("FREE", "feline", "felis-catus")).toBe(true);
  });

  it("FAIL-CLOSED: componente/slug desconhecido (fora de SPECIES_INFO) NUNCA resolve pra FREE", () => {
    expect(specimenVisibleAtTier("FREE", "feline", "slug-inexistente")).toBe(false);
    expect(specimenVisibleAtTier("JUNIOR", "feline", "slug-inexistente")).toBe(true);
  });

  it("raça canina fora de SPECIES_INFO (pack canine): JUNIOR NÃO vê, SENIOR vê (mínimo de família canina)", () => {
    expect(specimenVisibleAtTier("JUNIOR", "canine", "pastor-shetland")).toBe(false);
    expect(specimenVisibleAtTier("SENIOR", "canine", "pastor-shetland")).toBe(true);
  });

  it("FREE NÃO vê tigre-de-bengala nem tigre-branco (WILD_FELINE, mesmo intraespécie)", () => {
    expect(specimenVisibleAtTier("FREE", "feline", "panthera-tigris")).toBe(false);
    expect(specimenVisibleAtTier("FREE", "feline", "panthera-tigris-branco")).toBe(false);
  });
});

describe("assertTierAllows — defesa em profundidade do gate interespecífico", () => {
  it("FREE + interespecífico=true → ForbiddenException", () => {
    expect(() => assertTierAllows("FREE", "feline", "feline", true)).toThrow(ForbiddenException);
  });

  it("JUNIOR + interespecífico=true → não lança", () => {
    expect(() => assertTierAllows("JUNIOR", "feline", "feline", true)).not.toThrow();
  });
});

describe("isInterspecific (cross.service) — nunca por slug cru", () => {
  function specimen(pack: StoredSpecimen["pack"], species: string): StoredSpecimen {
    return { pack, species } as StoredSpecimen;
  }

  it("raça canina × raça canina → false (ambas canis-familiaris)", () => {
    expect(isInterspecific(specimen("canine", "collie"), specimen("canine", "dogo-argentino"))).toBe(false);
  });

  it("tigre-de-bengala × tigre-branco → false (mesma biologicalSpecies panthera-tigris)", () => {
    expect(isInterspecific(specimen("feline", "panthera-tigris"), specimen("feline", "panthera-tigris-branco"))).toBe(false);
  });

  it('híbrido "felis-catus×leptailurus-serval" × felis-catus → true (parental já multi-espécie)', () => {
    expect(isInterspecific(specimen("feline", "felis-catus×leptailurus-serval"), specimen("feline", "felis-catus"))).toBe(true);
  });

  it("panthera-leo × panthera-tigris → true (espécies biológicas distintas)", () => {
    expect(isInterspecific(specimen("feline", "panthera-leo"), specimen("feline", "panthera-tigris"))).toBe(true);
  });
});

// @genbreedai/shared não tem infraestrutura de teste própria (sem vitest nas
// devDependencies, sem script "test" — só "typecheck", ver package.json) —
// teste colocado aqui, em apps/api/test/, conforme instruído.
describe("normalizeBiologicalSpecies (@genbreedai/shared)", () => {
  it("colapsa morfo de cor na espécie selvagem", () => {
    expect(normalizeBiologicalSpecies("panthera-tigris-branco")).toBe("panthera-tigris");
  });

  it("híbrido composto: decompõe por '×', normaliza cada componente, deduplica e reordena", () => {
    expect(normalizeBiologicalSpecies("panthera-uncia×panthera-tigris-albino")).toBe("panthera-tigris×panthera-uncia");
  });

  it("espécie já canônica permanece igual", () => {
    expect(normalizeBiologicalSpecies("felis-catus")).toBe("felis-catus");
  });

  it("slug fora do catálogo (ex.: raça canina só em DOG_BREEDS) permanece como está", () => {
    expect(normalizeBiologicalSpecies("collie")).toBe("collie");
  });
});

// apps/web não tem infraestrutura de teste própria (sem vitest, ver
// conversa anterior) — displayName/displaySci (apps/web/lib/display.ts) são
// wrappers finos de resolveDisplayName/resolveScientificName
// (@genbreedai/shared, packages/shared/src/display.ts), testados aqui.
describe("resolveDisplayName/resolveScientificName (@genbreedai/shared) — nome de exibição/científico", () => {
  it('gêmeo de fundador ("gato-persa-femea") tem o MESMO nome do fundador base ("gato-persa")', () => {
    expect(resolveDisplayName("gato-persa-femea", "felis-catus")).toBe(resolveDisplayName("gato-persa", "felis-catus"));
    expect(resolveDisplayName("gato-persa-femea", "felis-catus")).toBe("Persa");
  });

  it('fundador de felino selvagem por id ("onca-negra") → nome próprio, não o nome genérico da espécie', () => {
    expect(resolveDisplayName("onca-negra", "panthera-onca")).toBe("Onça-negra");
    // Gêmeo ("-macho") → mesmo nome do fundador base.
    expect(resolveDisplayName("onca-negra-macho", "panthera-onca")).toBe("Onça-negra");
  });

  it("tabela completa dos 15 fundadores de felino selvagem de founderSeeds() (apps/api/src/specimens/in-memory.repository.ts)", () => {
    expect(WILD_FELINE_FOUNDER_NAMES).toEqual({
      "onca-pintada": "Onça-pintada",
      "onca-negra": "Onça-negra",
      "onca-pintada-2": "Onça-pintada II",
      puma: "Puma (Suçuarana)",
      leao: "Leão",
      "tigre-bengala": "Tigre-de-Bengala",
      "tigre-branco": "Tigre-branco",
      "tigre-albino": "Tigre-albino",
      leopardo: "Leopardo",
      jaguatirica: "Jaguatirica",
      guepardo: "Guepardo",
      serval: "Serval",
      "leopardo-das-neves": "Leopardo-das-neves",
      lince: "Lince",
      caracal: "Caracal",
    });
  });

  it("onça-pintada, onça-negra e onça-pintada-2 (mesma espécie panthera-onca) NÃO colapsam no mesmo nome", () => {
    const names = new Set([
      resolveDisplayName("onca-pintada", "panthera-onca"),
      resolveDisplayName("onca-negra", "panthera-onca"),
      resolveDisplayName("onca-pintada-2", "panthera-onca"),
    ]);
    expect(names.size).toBe(3);
  });

  it("raça (Felis catus/Canis familiaris) tem prioridade sobre o fundador selvagem/espécie", () => {
    expect(resolveScientificName("gato-persa-femea", "felis-catus")).toBe("Felis catus");
    expect(resolveScientificName("collie-femea", "collie")).toBe("Canis familiaris");
  });
});

describe("speciesInfo — nome científico de híbrido (species com '×') deduplicado", () => {
  it('raças caninas SEM entrada própria em SPECIES_INFO (fallback "Canis familiaris" pras duas) → científico SEM repetição: "Canis familiaris"', () => {
    expect(speciesInfo("collie×dogo-argentino").scientific).toBe("Canis familiaris");
  });

  it("híbrido de verdade (espécies científicas distintas) continua com '×'", () => {
    const sci = speciesInfo("panthera-uncia×panthera-tigris-albino").scientific;
    expect(sci).toContain("×");
    expect(sci).toBe("Panthera uncia × Panthera tigris (albino)");
  });
});
