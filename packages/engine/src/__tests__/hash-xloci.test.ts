/**
 * hashGenotype / cacheKey e os loci LIGADOS AO X (ADR-0035): dois gatos iguais exceto no O (laranja) NÃO podem dividir a mesma chave/retrato;
 * genótipo SEM xLoci (todo fundador) continua gerando EXATAMENTE a chave de antes — nenhuma cacheKey existente é invalidada.
 */
import { describe, it, expect } from "vitest";
import { CURRENT_ART_VERSION, type Genotype } from "@genbreedai/shared";
import { cross, computeCacheKey, hashGenotype, FELINE_PACK, type ParentInput, type CrossContext } from "../index";
import type { Pedigree } from "../index";
import { sha256 } from "../sha256";

const AUTOSOMAL: Record<string, [string, string]> = {
  A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "D"], W: ["w", "w"], S: ["s", "s"],
  Ma: ["ma", "ma"], Fl: ["Fl^s", "Fl^s"], Hr: ["Hr", "Hr"], Bd: ["Bd^d", "Bd^d"], He: ["He^r", "He^r"], Ec: ["Ec^n", "Ec^n"],
};
const g = (xLoci?: Genotype["xLoci"]): Genotype => ({ loci: { ...AUTOSOMAL }, qtl: { porte: 0.5 }, ...(xLoci ? { xLoci } : {}) });

describe("hashGenotype com xLoci", () => {
  it("SEM xLoci: a string é a de sempre (formato literal), com ou sem a chave `xLoci: {}` vazia", () => {
    const small: Genotype = { loci: { A: ["a", "A"] }, qtl: { porte: 0.5 } };
    expect(hashGenotype(small)).toBe("loci{A:A/a}|qtl{porte=0.500000}");
    expect(hashGenotype({ ...small, xLoci: {} })).toBe("loci{A:A/a}|qtl{porte=0.500000}");
  });

  it("COM xLoci: sufixo |x{O:…} com alelos distintos e ordenados — [o] e [o,o] iguais; [O,o] e [o,O] iguais", () => {
    expect(hashGenotype(g({ O: ["o"] }))).toMatch(/\|x\{O:o\}$/);
    expect(hashGenotype(g({ O: ["o", "o"] }))).toBe(hashGenotype(g({ O: ["o"] })));
    expect(hashGenotype(g({ O: ["O"] }))).toMatch(/\|x\{O:O\}$/);
    expect(hashGenotype(g({ O: ["O", "o"] }))).toMatch(/\|x\{O:O\/o\}$/);
    expect(hashGenotype(g({ O: ["o", "O"] }))).toBe(hashGenotype(g({ O: ["O", "o"] })));
  });

  it("iguais exceto no O → chaves DIFERENTES (laranja, não-laranja e tartaruga não dividem retrato)", () => {
    const keys = [undefined, { O: ["o"] }, { O: ["O"] }, { O: ["O", "o"] }].map((x) => computeCacheKey(g(x as Genotype["xLoci"]), FELINE_PACK, "F"));
    // sem xLoci é "o" implícito no motor, mas na CHAVE é o formato antigo: precisa continuar diferente do que tem X declarado só se o X existir
    expect(new Set(keys.slice(1)).size).toBe(3);
  });

  it("genótipo sem xLoci: computeCacheKey == sha256(fórmula antiga) — nenhuma chave existente muda", () => {
    const geno = g();
    const legacy = sha256(hashGenotype(geno) + "|" + FELINE_PACK.id + "|" + CURRENT_ART_VERSION);
    expect(computeCacheKey(geno, FELINE_PACK)).toBe(legacy);
    expect(hashGenotype(geno)).not.toContain("|x{");
  });

  it("macho [o] e fêmea [o,o] com o mesmo genótipo têm a MESMA chave (a aparência é idêntica)", () => {
    expect(computeCacheKey(g({ O: ["o"] }), FELINE_PACK, "M")).toBe(computeCacheKey(g({ O: ["o", "o"] }), FELINE_PACK, "F"));
  });
});

describe("cross(): a cacheKey do nascido enxerga o X", () => {
  const pedigree: Pedigree = { sire: { id: "sire", sire: null, dam: null }, dam: { id: "dam", sire: null, dam: null } };
  const ctx: CrossContext = { pack: FELINE_PACK, pedigree };
  const sire: ParentInput = { id: "sire", genotype: g({ O: ["O"] }), generation: 0, sex: "M", species: "felis-catus" };
  const dam: ParentInput = { id: "dam", genotype: g({ O: ["o", "o"] }), generation: 0, sex: "F", species: "felis-catus" };

  it("result.cacheKey == computeCacheKey(genótipo do filhote COM xLoci, pack, sexo) em 60 seeds", () => {
    for (let i = 0; i < 60; i++) {
      const r = cross(sire, dam, "F1", `hx-${i}`, ctx);
      expect(r.specimen.genotype.xLoci).toBeDefined();
      expect(r.cacheKey, `seed ${i}`).toBe(computeCacheKey(r.specimen.genotype, FELINE_PACK, r.specimen.sex));
      expect(hashGenotype(r.specimen.genotype)).toContain("|x{O:");
    }
  });

  it("filhas O/o (tartaruga) e filhos [o] do mesmo cruzamento geram chaves de retrato distintas quando o X difere", () => {
    const seen = new Map<string, string>();
    for (let i = 0; i < 60; i++) {
      const r = cross(sire, dam, "F1", `hx2-${i}`, ctx);
      const x = hashGenotype({ loci: r.specimen.genotype.loci, qtl: {}, xLoci: r.specimen.genotype.xLoci }).split("|x")[1]!;
      seen.set(x, "ok");
    }
    expect(seen.has("{O:O/o}")).toBe(true); // filha tartaruga
    expect(seen.has("{O:o}")).toBe(true); // filho não-laranja
  });
});
