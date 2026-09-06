import { describe, it, expect } from "vitest";
import { cross, punnettLocus, genotypeProbability, jointGenotypeProbability, expressPhenotype, CANINE_PACK } from "../../index";
import { OMEGA_II, DANECOLLIE_BETA, DANECOLLIE_PEDIGREE } from "../fixtures";
const O = OMEGA_II.loci, B = DANECOLLIE_BETA.loci;
const omega = { id: "omegaII", genotype: OMEGA_II, generation: 2 };
const beta = { id: "beta", genotype: DANECOLLIE_BETA, generation: 1 };
const ctx = { pack: CANINE_PACK, pedigree: DANECOLLIE_PEDIGREE, interspecific: false, targetLoci: ["M","A"], generationsUnderSelection: 3 };
describe("Danecollie F3 (TDD §4.5)", () => {
  it("m/m reaparece em EXATOS 25%", () => { expect(genotypeProbability(O.M!, B.M!, "m/m")).toBe(0.25); });
  it("loco Merle: 1 M/M : 2 M/m : 1 m/m", () => {
    const d = punnettLocus(O.M!, B.M!);
    expect(d.get("M/M")).toBe(0.25); expect(d.get("M/m")).toBe(0.5); expect(d.get("m/m")).toBe(0.25);
  });
  it("M/M (duplo-merle) é LETAL", () => {
    expect(expressPhenotype({ loci: { M: ["M","M"] as [string,string], A: ["a","a"] as [string,string] }, qtl: {} }, CANINE_PACK).viable).toBe(false);
  });
  it("epistasia Harlequin (H) sobre Merle (M)", () => {
    const ph = expressPhenotype({ loci: { H: ["H","h"] as [string,string], M: ["M","m"] as [string,string] }, qtl: {} }, CANINE_PACK);
    expect(ph.epistasis).toContain("harlequin-sobre-merle"); expect(ph.loci.M).toContain("arlequim");
  });
  it("recombinantes Tau/Phi com probabilidade conjunta exata", () => {
    expect(jointGenotypeProbability(O, B, { H: "H/h", M: "M/m", A: "a/a" })).toBe(0.125);
    expect(jointGenotypeProbability(O, B, { M: "M/m", A: "a/a", S: "s^p/s^p" })).toBe(0.0625);
  });
  it("determinístico", () => { expect(cross(omega, beta, "F3", "dc-01", ctx)).toEqual(cross(omega, beta, "F3", "dc-01", ctx)); });
});
