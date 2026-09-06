import { describe, it, expect } from "vitest";
import { cross, punnettPhenotypeLocus, wrightF, CANINE_PACK } from "../../index";
import { GOLDEN_RETRIEVER, POODLE, GOLDENDOODLE_PEDIGREE } from "../fixtures";
const A = { id: "golden", genotype: GOLDEN_RETRIEVER, generation: 0 };
const B = { id: "poodle", genotype: POODLE, generation: 0 };
const ctx = { pack: CANINE_PACK, pedigree: GOLDENDOODLE_PEDIGREE, interspecific: false, targetLoci: ["F"], generationsUnderSelection: 1 };
describe("Goldendoodle F1 (TDD §4.5)", () => {
  it("F_pedigree = 0.00", () => { expect(wrightF(GOLDENDOODLE_PEDIGREE, "golden", "poodle")).toBe(0); });
  it("textura F1: 100% ondulado (F/F impossível na F1)", () => {
    const d = punnettPhenotypeLocus(CANINE_PACK.loci.F!, GOLDEN_RETRIEVER.loci.F!, POODLE.loci.F!);
    expect(d.get("ondulado")).toBe(1); expect(d.get("cacheado")).toBeUndefined();
  });
  it("cor F1 segrega 1:1", () => {
    const d = punnettPhenotypeLocus(CANINE_PACK.loci.C!, GOLDEN_RETRIEVER.loci.C!, POODLE.loci.C!);
    expect(d.get("creme")).toBe(0.5); expect(d.get("creme-parcial")).toBe(0.5);
  });
  it("cross() viável, fértil, Aura ★, determinístico", () => {
    const r = cross(A, B, "F1", "gd-01", ctx);
    expect(r.specimen.phenotype.viable).toBe(true);
    expect(r.specimen.fertility.score).toBe(100);
    expect(r.specimen.aura).toBe(1);
    expect(r.specimen.fPedigree).toBe(0);
    expect(cross(A, B, "F1", "gd-01", ctx)).toEqual(r);
  });
});
