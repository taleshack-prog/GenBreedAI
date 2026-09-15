import { describe, it, expect } from "vitest";
import { ForbiddenException } from "@nestjs/common";
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
