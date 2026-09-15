import { describe, it, expect } from "vitest";
import { familyVisibleAtTier, specimenVisibleAtTier } from "../src/common/tier-access";

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
});
