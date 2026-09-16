/**
 * Loci LIMITADOS AO SEXO (ADR-0017) — juba (Ma, pack felino) como caso real.
 * NÃO é golden: não tem seed/valor documentado em ADR anterior, é teste de
 * comportamento novo. Os 4 golden tests continuam intocados (ver ADR-0017).
 */
import { describe, it, expect } from "vitest";
import { expressPhenotype, materializeCross, computeCacheKey, hashGenotype, sha256, FELINE_PACK, type ParentInput, type CrossContext } from "../index";
import type { Genotype, Pedigree } from "../index";
import { CURRENT_ART_VERSION } from "@genbreedai/shared";

describe("Juba (Ma) é SEX_LIMITED_M (ADR-0017)", () => {
  it("Leão M Ma/Ma → juba completa; leoa F Ma/Ma → sem juba (genótipo idêntico)", () => {
    const genotype: Genotype = { loci: { Ma: ["Ma", "Ma"] }, qtl: {} };
    const male = expressPhenotype(genotype, FELINE_PACK, "M");
    const female = expressPhenotype(genotype, FELINE_PACK, "F");
    expect(male.loci.Ma).toBe("juba completa");
    expect(female.loci.Ma).toBe("sem juba");
  });

  it("filho MACHO de leão ma/ma × leoa Ma/Ma pode expressar juba (a fêmea transmite, mesmo sem mostrar)", () => {
    // Punnett determinístico: pai só tem "ma", mãe só tem "Ma" → filho é
    // SEMPRE Ma/ma (heterozigoto), sem depender de sorteio. INCOMPLETE
    // dominance → "juba parcial" — a fêmea (fenotipicamente sem juba)
    // continua transmitindo Ma normalmente; a limitação é de EXPRESSÃO, não
    // de herança (Ma não é ligado ao X — é autossômico).
    const sonGenotype: Genotype = { loci: { Ma: ["ma", "Ma"] }, qtl: {} };
    const son = expressPhenotype(sonGenotype, FELINE_PACK, "M");
    expect(son.loci.Ma).toBe("juba parcial");
  });

  it("cacheKey: leão M ≠ leoa F (mesmo genótipo Ma/Ma — juba muda a aparência)", () => {
    const maneGenotype: Genotype = { loci: { Ma: ["Ma", "Ma"] }, qtl: {} };
    const sire: ParentInput = { id: "sire", genotype: { loci: { Ma: ["ma", "ma"] }, qtl: {} }, generation: 0, sex: "M", species: "panthera-leo" };
    const dam: ParentInput = { id: "dam", genotype: { loci: { Ma: ["ma", "ma"] }, qtl: {} }, generation: 0, sex: "F", species: "panthera-leo" };
    const pedigree: Pedigree = { sire: { id: "sire", sire: null, dam: null }, dam: { id: "dam", sire: null, dam: null } };
    const ctx: CrossContext = { pack: FELINE_PACK, pedigree, targetLoci: ["Ma"], generationsUnderSelection: 1 };
    const seedForSex = (sex: "M" | "F"): string => {
      for (let i = 0; i < 50; i++) {
        const seed = `leao-ck-${i}`;
        if (materializeCross(sire, dam, "F1", seed, ctx, maneGenotype).specimen.sex === sex) return seed;
      }
      throw new Error(`sem seed pra sexo ${sex} (leão)`);
    };
    const rM = materializeCross(sire, dam, "F1", seedForSex("M"), ctx, maneGenotype);
    const rF = materializeCross(sire, dam, "F1", seedForSex("F"), ctx, maneGenotype);
    expect(rM.specimen.sex).toBe("M");
    expect(rF.specimen.sex).toBe("F");
    expect(rM.specimen.phenotype.loci.Ma).toBe("juba completa");
    expect(rF.specimen.phenotype.loci.Ma).toBe("sem juba");
    expect(rM.cacheKey).not.toBe(rF.cacheKey);
  });

  it("cacheKey: onça M == onça F (mesmo genótipo ma/ma — nunca expressa juba, em nenhum sexo)", () => {
    const noManeGenotype: Genotype = { loci: { Ma: ["ma", "ma"] }, qtl: {} };
    const sire: ParentInput = { id: "sire2", genotype: { loci: { Ma: ["ma", "ma"] }, qtl: {} }, generation: 0, sex: "M", species: "panthera-onca" };
    const dam: ParentInput = { id: "dam2", genotype: { loci: { Ma: ["ma", "ma"] }, qtl: {} }, generation: 0, sex: "F", species: "panthera-onca" };
    const pedigree: Pedigree = { sire2: { id: "sire2", sire: null, dam: null }, dam2: { id: "dam2", sire: null, dam: null } };
    const ctx: CrossContext = { pack: FELINE_PACK, pedigree, targetLoci: ["Ma"], generationsUnderSelection: 1 };
    const seedForSex = (sex: "M" | "F"): string => {
      for (let i = 0; i < 50; i++) {
        const seed = `onca-ck-${i}`;
        if (materializeCross(sire, dam, "F1", seed, ctx, noManeGenotype).specimen.sex === sex) return seed;
      }
      throw new Error(`sem seed pra sexo ${sex} (onça)`);
    };
    const rM = materializeCross(sire, dam, "F1", seedForSex("M"), ctx, noManeGenotype);
    const rF = materializeCross(sire, dam, "F1", seedForSex("F"), ctx, noManeGenotype);
    expect(rM.specimen.sex).toBe("M");
    expect(rF.specimen.sex).toBe("F");
    expect(rM.specimen.phenotype.loci.Ma).toBe("sem juba");
    expect(rF.specimen.phenotype.loci.Ma).toBe("sem juba");
    expect(rM.cacheKey).toBe(rF.cacheKey);
  });
});

describe("computeCacheKey (ADR-0017) — fórmula ÚNICA, extraída de finalizeSpecimen", () => {
  const oncaGenotype: Genotype = { loci: { Ma: ["ma", "ma"] }, qtl: {} };
  const leaoGenotype: Genotype = { loci: { Ma: ["Ma", "Ma"] }, qtl: {} };
  const oldFormula = (g: Genotype) => sha256(hashGenotype(g) + "|" + FELINE_PACK.id + "|" + CURRENT_ART_VERSION);

  it("onça: M == F == fórmula antiga (ma/ma nunca expressa juba, em nenhum sexo)", () => {
    const old = oldFormula(oncaGenotype);
    expect(computeCacheKey(oncaGenotype, FELINE_PACK, "M")).toBe(old);
    expect(computeCacheKey(oncaGenotype, FELINE_PACK, "F")).toBe(old);
  });

  it("leão: M != F (Ma/Ma muda a aparência entre os sexos)", () => {
    expect(computeCacheKey(leaoGenotype, FELINE_PACK, "M")).not.toBe(computeCacheKey(leaoGenotype, FELINE_PACK, "F"));
  });

  it("leão SEM sex informado == fórmula antiga (retrocompatível — chamador que não sabe o sexo)", () => {
    expect(computeCacheKey(leaoGenotype, FELINE_PACK)).toBe(oldFormula(leaoGenotype));
  });
});
