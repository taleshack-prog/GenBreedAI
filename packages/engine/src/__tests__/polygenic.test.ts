import { describe, it, expect } from "vitest";
import { cross } from "../cross";
import { CANINE_PACK } from "../data/canine";

describe("QTL poligênico (ADR-0012)", () => {
  const loci = { B:["B","B"], K:["k^y","k^y"], A:["A^y","A^y"], E:["E","E"], S:["S","S"], R:["r","r"], F:["f","f"], C:["C","C"], M:["m","m"], H:["h","h"], Cph:["Cph^m","Cph^m"], Ec:["Ec^e","Ec^e"], Cl:["Cl^s","Cl^s"], Ct:["Ct^n","Ct^n"], Tl:["Tl^l","Tl^l"], D:["D","D"] } as any;
  const mk = (porte: number) => ({ id: porte > 0.5 ? "big" : "small", genotype: { loci, qtl: { porte, vigor: 0.5, beleza: 0.5, temperamento: 0.5 } }, generation: 0 });
  const ctx = { pack: CANINE_PACK, pedigree: {} } as any;

  it("determinístico sob seed", () => {
    const a = cross(mk(0.9) as any, mk(0.3) as any, "F1", "s1", ctx);
    const b = cross(mk(0.9) as any, mk(0.3) as any, "F1", "s1", ctx);
    expect(a.specimen.genotype.qtl.porte).toBe(b.specimen.genotype.qtl.porte);
  });
  it("irmãos variam (segregação) em torno da média parental", () => {
    const portes = ["a","b","c","d","e"].map((s) => cross(mk(0.9) as any, mk(0.3) as any, "F1", s, ctx).specimen.genotype.qtl.porte ?? 0);
    const uniq = new Set(portes.map((p) => p.toFixed(4)));
    expect(uniq.size).toBeGreaterThan(1); // variam
    const avg = portes.reduce((x, y) => x + y, 0) / portes.length;
    expect(avg).toBeGreaterThan(0.4); expect(avg).toBeLessThan(0.8); // ~0.6 midparent
  });
  it("QTL fica no intervalo [0,1]", () => {
    for (const s of ["x","y","z"]) {
      const p = cross(mk(0.98) as any, mk(0.95) as any, "F1", s, ctx).specimen.genotype.qtl.porte;
      expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1);
    }
  });
});
