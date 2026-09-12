/** Testes unitários das primitivas do motor (núcleo genérico, inalterado). */
import { describe, it, expect } from "vitest";
import {
  createPrng, wrightF, kinship, fStatistic, sha256, fixationIndex,
  mapFixationToAura, fertilityScore, gameteFrequencies, expressPhenotype,
  CANINE_PACK,
  FELINE_PACK
} from "../index";

describe("PRNG determinístico", () => {
  it("mesma seed → mesma sequência", () => {
    const a = createPrng("x"), b = createPrng("x");
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });
  it("next() ∈ [0,1)", () => {
    const r = createPrng("z");
    for (let i = 0; i < 500; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe("F de Wright (coancestria)", () => {
  const ped = {
    p1: { id: "p1", sire: null, dam: null }, p2: { id: "p2", sire: null, dam: null },
    s1: { id: "s1", sire: "p1", dam: "p2" }, s2: { id: "s2", sire: "p1", dam: "p2" },
  };
  it("fundadores não aparentados → 0", () => { expect(wrightF(ped, "p1", "p2")).toBe(0); });
  it("irmãos completos → 0.25", () => { expect(wrightF(ped, "s1", "s2")).toBe(0.25); });
  it("kinship(x,x) = 0.5 (fundador)", () => { expect(kinship(ped, "p1", "p1")).toBe(0.5); });
});

describe("Estatística F", () => {
  it("F = 1 − H_obs/H_exp", () => { expect(fStatistic(0.3, 0.5)).toBeCloseTo(0.4, 10); });
});

describe("Índice de Fixação e Auras", () => {
  it("IF composto (fórmula TDD §4.3)", () => {
    const r = fixationIndex({ genotype: { loci: { STR: ["A","A"], SPD: ["A","B"] }, qtl: {} }, targetLoci: ["STR","SPD"], fPedigree: 0.25, generationsUnderSelection: 7 });
    expect(r.index).toBeCloseTo(0.75, 10);
  });
  it("auras", () => {
    expect(mapFixationToAura(0.1)).toBe(1); expect(mapFixationToAura(0.6)).toBe(3); expect(mapFixationToAura(0.95)).toBe(5);
  });
});

describe("Fertilidade", () => {
  const rng = createPrng("f");
  it("F1 interespecífico → Haldane (0, estéril)", () => {
    const r = fertilityScore("F1", 0, { interspecific: true, rng });
    expect(r.score).toBe(0); expect(r.haldaneSterile).toBe(true);
  });
  it("depressão endogâmica F=0.25 → −20%", () => {
    expect(fertilityScore("LINE", 0.25, { interspecific: false, rng }).score).toBeCloseTo(80, 6);
  });
});

describe("Frequências gaméticas", () => {
  it("heterozigoto → 0.5/0.5", () => {
    const m = gameteFrequencies(["A", "B"]); expect(m.get("A")).toBe(0.5); expect(m.get("B")).toBe(0.5);
  });
});

describe("SHA-256 (FIPS)", () => {
  it("abc", () => { expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); });
});

describe("Expressão canina (merle/harlequin)", () => {
  it("M/m → merle; m/m → não-merle", () => {
    expect(expressPhenotype({ loci: { M: ["M","m"] }, qtl: {} }, CANINE_PACK).loci.M).toBe("merle");
    expect(expressPhenotype({ loci: { M: ["m","m"] }, qtl: {} }, CANINE_PACK).loci.M).toBe("não-merle");
  });
});

describe("Juba (Ma) — herança com dominância incompleta (lígre)", () => {
  const ph = (ma: [string, string]) => expressPhenotype({ loci: { Ma: ma }, qtl: {} }, FELINE_PACK).loci.Ma;
  it("Ma/Ma → juba completa (leão)", () => { expect(ph(["Ma","Ma"])).toBe("juba completa"); });
  it("Ma/ma → juba parcial (híbrido tipo lígre)", () => { expect(ph(["Ma","ma"])).toBe("juba parcial"); });
  it("ma/ma → sem juba", () => { expect(ph(["ma","ma"])).toBe("sem juba"); });
});
