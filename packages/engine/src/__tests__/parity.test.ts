import { describe, it, expect } from "vitest";
import { cross, hashGenotype, FELINE_PACK } from "../index";
import { DELTA_F1, ONCA_NEGRA, PUMAJAGUAR_PEDIGREE } from "./fixtures";
const delta = { id: "delta", genotype: DELTA_F1, generation: 1 };
const negra = { id: "negra", genotype: ONCA_NEGRA, generation: 0 };
const ctx = { pack: FELINE_PACK, pedigree: PUMAJAGUAR_PEDIGREE, interspecific: true, targetLoci: ["A"], generationsUnderSelection: 2 };
const TIERS = ["FREE","JUNIOR","SENIOR","PHD"] as const;
describe("Anti-P2W", () => {
  it("mesma entrada → resultado idêntico em todos os tiers", () => {
    const rs = TIERS.map(() => cross(delta, negra, "BC1", "p-42", ctx));
    const ref = rs[0]!;
    for (const r of rs) { expect(r).toEqual(ref); expect(hashGenotype(r.specimen.genotype)).toBe(hashGenotype(ref.specimen.genotype)); }
  });
  it("cross() não expõe tier (5 params)", () => { expect(cross.length).toBe(5); });
});
