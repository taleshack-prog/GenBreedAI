import { describe, it, expect } from "vitest";
import { classifyCross } from "../classify";
import type { Pedigree } from "../types";

describe("Classificador de cruzamento (determinístico)", () => {
  const base = { sireGeneration: 1, damGeneration: 1 };
  it("espécies diferentes sem parentesco → F1", () => {
    const r = classifyCross({ ...base, sireId: "a", damId: "b", sireSpecies: "collie", damSpecies: "dogo", sireGeneration: 0, damGeneration: 0, pedigree: {} });
    expect(r.method).toBe("F1");
  });
  it("mesma espécie sem parentesco → OUTCROSS", () => {
    const r = classifyCross({ ...base, sireId: "a", damId: "b", sireSpecies: "collie", damSpecies: "collie", pedigree: {} });
    expect(r.method).toBe("OUTCROSS");
  });
  it("irmãos completos (F1×F1) → F2", () => {
    const ped: Pedigree = { p1: { id:"p1", sire:null, dam:null }, p2: { id:"p2", sire:null, dam:null },
      a: { id:"a", sire:"p1", dam:"p2" }, b: { id:"b", sire:"p1", dam:"p2" } };
    const r = classifyCross({ ...base, sireId: "a", damId: "b", sireSpecies: "x", damSpecies: "x", pedigree: ped });
    expect(r.method).toBe("F2");
  });
  it("pai × filho → BC1 (retrocruza)", () => {
    const ped: Pedigree = { p1: { id:"p1", sire:null, dam:null }, m: { id:"m", sire:null, dam:null },
      filho: { id:"filho", sire:"p1", dam:"m" } };
    const r = classifyCross({ ...base, sireId: "p1", damId: "filho", sireSpecies: "x", damSpecies: "x", pedigree: ped });
    expect(r.method).toBe("BC1");
  });
});
