import { describe, it, expect } from "vitest";
import { cross, punnettLocus, genotypeProbability, wrightF, FELINE_PACK } from "../../index";
import { DELTA_F1, ONCA_NEGRA, PUMAJAGUAR_PEDIGREE } from "../fixtures";
const D = DELTA_F1.loci, N = ONCA_NEGRA.loci;
const delta = { id: "delta", genotype: DELTA_F1, generation: 1 };
const negra = { id: "negra", genotype: ONCA_NEGRA, generation: 0 };
const ctx = { pack: FELINE_PACK, pedigree: PUMAJAGUAR_PEDIGREE, interspecific: true, targetLoci: ["A"], generationsUnderSelection: 2 };
describe("Pumajaguar BC1 (TDD §4.5)", () => {
  it("F_pedigree = 0.25 (retrocruzamento ao progenitor)", () => { expect(wrightF(PUMAJAGUAR_PEDIGREE, "delta", "negra")).toBe(0.25); });
  it("fixação do melanismo: P(A_)=0.75, P(AA)=0.25", () => {
    const d = punnettLocus(D.A!, N.A!);
    expect(d.get("A/A")).toBe(0.25); expect(d.get("A/a")).toBe(0.5); expect(d.get("a/a")).toBe(0.25);
    expect(genotypeProbability(D.A!,N.A!,"A/A") + genotypeProbability(D.A!,N.A!,"A/a")).toBe(0.75);
  });
  it("IF corrigido ≥ 0.30 (o 'IF≈0.03' do TDD é impossível — ADR-0004)", () => {
    expect(cross(delta, negra, "BC1", "pj-01", ctx).specimen.fixationIndex).toBeGreaterThanOrEqual(0.3);
  });
  it("BC1 sob depressão (F=0.25); sem Haldane (não é F1); determinístico", () => {
    const r = cross(delta, negra, "BC1", "pj-01", ctx);
    expect(r.specimen.fertility.haldaneSterile).toBe(false);
    expect(r.specimen.fertility.inviabilityRisk).toBe(0);
    expect(cross(delta, negra, "BC1", "pj-01", ctx)).toEqual(r);
  });
});
