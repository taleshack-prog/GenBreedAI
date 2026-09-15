import { describe, it, expect } from "vitest";
import { cross, hashGenotype, FELINE_PACK, type ParentInput } from "../index";
import { DELTA_F1, ONCA_NEGRA, PUMAJAGUAR_PEDIGREE } from "./fixtures";
// Orientação corrigida (ADR-0015, item 5, mesma do golden pumajaguar.test.ts):
// Delta (F1 macho seria estéril por Haldane) vira fêmea/dam; Onça Negra vira
// macho/sire. Ver comentário completo em golden/pumajaguar.test.ts.
const delta: ParentInput = { id: "delta", genotype: DELTA_F1, generation: 1, sex: "F", fertility: 10 };
const negra: ParentInput = { id: "negra", genotype: ONCA_NEGRA, generation: 0, sex: "M", species: "panthera-onca" };
const ctx = { pack: FELINE_PACK, pedigree: PUMAJAGUAR_PEDIGREE, interspecific: true, targetLoci: ["A"], generationsUnderSelection: 2 };
const TIERS = ["FREE","JUNIOR","SENIOR","PHD"] as const;
describe("Anti-P2W", () => {
  it("mesma entrada → resultado idêntico em todos os tiers", () => {
    const rs = TIERS.map(() => cross(negra, delta, "BC1", "p-42", ctx));
    const ref = rs[0]!;
    for (const r of rs) { expect(r).toEqual(ref); expect(hashGenotype(r.specimen.genotype)).toBe(hashGenotype(ref.specimen.genotype)); }
  });
  it("cross() não expõe tier (5 params)", () => { expect(cross.length).toBe(5); });
});
