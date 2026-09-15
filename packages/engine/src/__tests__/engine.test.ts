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

describe("Fertilidade — F1 interespecífico, split por sexo × hybridClass (ADR-0015, item 6)", () => {
  const rng = createPrng("f");

  it("SAME_SPECIES (intraespécie) → 100, haldaneStatus NONE, independente do sexo", () => {
    const m = fertilityScore("F1", 0, { sex: "M", hybridClass: "SAME_SPECIES", rng });
    const f = fertilityScore("F1", 0, { sex: "F", hybridClass: "SAME_SPECIES", rng });
    expect(m.score).toBe(100); expect(m.haldaneStatus).toBe("NONE"); expect(m.haldaneSterile).toBe(false);
    expect(f.score).toBe(100); expect(f.haldaneStatus).toBe("NONE"); expect(f.haldaneSterile).toBe(false);
  });

  it("macho, DOCUMENTED_FERTILE_FEMALE → 0, STERILE (classe NÃO importa pro macho)", () => {
    const r = fertilityScore("F1", 0, { sex: "M", hybridClass: "DOCUMENTED_FERTILE_FEMALE", rng });
    expect(r.score).toBe(0); expect(r.haldaneStatus).toBe("STERILE"); expect(r.haldaneSterile).toBe(true);
  });

  it("macho, UNDOCUMENTED → 0, STERILE (idêntico ao caso DOCUMENTED — a classe não muda o resultado do macho)", () => {
    const r = fertilityScore("F1", 0, { sex: "M", hybridClass: "UNDOCUMENTED", rng });
    expect(r.score).toBe(0); expect(r.haldaneStatus).toBe("STERILE"); expect(r.haldaneSterile).toBe(true);
  });

  it("fêmea, DOCUMENTED_FERTILE_FEMALE → faixa 50–80, REDUCED", () => {
    for (let i = 0; i < 50; i++) {
      const r = fertilityScore("F1", 0, { sex: "F", hybridClass: "DOCUMENTED_FERTILE_FEMALE", rng: createPrng(`doc-${i}`) });
      expect(r.score).toBeGreaterThanOrEqual(50); expect(r.score).toBeLessThanOrEqual(80);
      expect(r.haldaneStatus).toBe("REDUCED"); expect(r.haldaneSterile).toBe(false);
    }
  });

  it("fêmea, UNDOCUMENTED → faixa 5–15, REDUCED", () => {
    for (let i = 0; i < 50; i++) {
      const r = fertilityScore("F1", 0, { sex: "F", hybridClass: "UNDOCUMENTED", rng: createPrng(`und-${i}`) });
      expect(r.score).toBeGreaterThanOrEqual(5); expect(r.score).toBeLessThanOrEqual(15);
      expect(r.haldaneStatus).toBe("REDUCED"); expect(r.haldaneSterile).toBe(false);
    }
  });

  it("determinismo: mesma seed → mesma fertilidade da fêmea (nas duas classes)", () => {
    const a1 = fertilityScore("F1", 0, { sex: "F", hybridClass: "DOCUMENTED_FERTILE_FEMALE", rng: createPrng("det-fem") });
    const a2 = fertilityScore("F1", 0, { sex: "F", hybridClass: "DOCUMENTED_FERTILE_FEMALE", rng: createPrng("det-fem") });
    expect(a1.score).toBe(a2.score);
    const b1 = fertilityScore("F1", 0, { sex: "F", hybridClass: "UNDOCUMENTED", rng: createPrng("det-fem-2") });
    const b2 = fertilityScore("F1", 0, { sex: "F", hybridClass: "UNDOCUMENTED", rng: createPrng("det-fem-2") });
    expect(b1.score).toBe(b2.score);
  });

  it("depressão endogâmica F=0.25 → −20%", () => {
    expect(fertilityScore("LINE", 0.25, { sex: "M", hybridClass: "SAME_SPECIES", rng }).score).toBeCloseTo(80, 6);
  });

  it("anti-P2W: fertilityScore/cross() não recebem tier (fertilityScore tem 3 params fixos)", () => {
    expect(fertilityScore.length).toBe(3);
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
