import { describe, it, expect } from "vitest";
import { cross, punnettPhenotypeLocus, genotypeProbability, jointGenotypeProbability, wrightF, CANINE_PACK } from "../../index";
import { BOERPOINTER_F1, BOERPOINTER_PEDIGREE } from "../fixtures";
const L = BOERPOINTER_F1.loci;
const alpha = { id: "alpha", genotype: BOERPOINTER_F1, generation: 1 };
const beta = { id: "beta", genotype: BOERPOINTER_F1, generation: 1 };
const ctx = { pack: CANINE_PACK, pedigree: BOERPOINTER_PEDIGREE, interspecific: false, targetLoci: ["B","K","A"], generationsUnderSelection: 2 };
describe("Boerpointer F2 (TDD §4.5)", () => {
  it("F_pedigree = 0.25 (irmãos completos)", () => { expect(wrightF(BOERPOINTER_PEDIGREE, "alpha", "beta")).toBe(0.25); });
  it("segregação 3:1 no loco B", () => {
    const d = punnettPhenotypeLocus(CANINE_PACK.loci.B!, L.B!, L.B!);
    expect(d.get("preto/roan")).toBe(0.75); expect(d.get("liver/chocolate")).toBe(0.25);
  });
  it("recessivos reaparecem em 25% (B,K,A) e piebald s^p/s^p", () => {
    expect(genotypeProbability(L.B!, L.B!, "b/b")).toBe(0.25);
    expect(genotypeProbability(L.K!, L.K!, "k^y/k^y")).toBe(0.25);
    expect(genotypeProbability(L.A!, L.A!, "a/a")).toBe(0.25);
    expect(jointGenotypeProbability(L, L, { S: "s^p/s^p", B: "B/b" })).toBe(0.25 * 0.5);
  });
  it("cross() F2 F=0.25, viável, determinístico", () => {
    const r = cross(alpha, beta, "F2", "bp-01", ctx);
    expect(r.specimen.fPedigree).toBe(0.25);
    expect(r.specimen.phenotype.viable).toBe(true);
    expect(cross(alpha, beta, "F2", "bp-01", ctx)).toEqual(r);
  });
});
