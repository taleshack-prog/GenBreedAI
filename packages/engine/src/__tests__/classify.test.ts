import { describe, it, expect } from "vitest";
import { classifyCross } from "../classify";
import type { Pedigree } from "../types";

describe("Classificador de cruzamento (determinístico)", () => {
  // sireFPedigree/damFPedigree: 0 por padrão (irrelevante nos testes que nem
  // chegam na regra 7 — F1 de espécies diferentes, F2 de irmãos, BC1).
  const base = { sireGeneration: 1, damGeneration: 1, sireFPedigree: 0, damFPedigree: 0 };
  it("espécies diferentes sem parentesco → F1", () => {
    const r = classifyCross({ ...base, sireId: "a", damId: "b", sireSpecies: "collie", damSpecies: "dogo", sireGeneration: 0, damGeneration: 0, pedigree: {} });
    expect(r.method).toBe("F1");
  });
  // CORREÇÃO (achado em produção, /app/reveal/[id]): dois fundadores da MESMA
  // espécie, sem parentesco ENTRE si e sem endogamia PRÓPRIA (F_pedigree=0 em
  // ambos) não são "resgate de sangue novo" — não há linha nenhuma pra
  // resgatar. É o primeiro cruzamento: F1. Antes desta correção, este mesmo
  // cenário (o de "mesma espécie sem parentesco") sempre virava OUTCROSS —
  // teste dividido em dois: sem endogamia própria → F1; COM → OUTCROSS.
  it("mesma espécie, sem parentesco ENTRE os pais e SEM endogamia própria (ex.: dois fundadores) → F1, não OUTCROSS", () => {
    const r = classifyCross({ ...base, sireId: "a", damId: "b", sireSpecies: "collie", damSpecies: "collie", sireFPedigree: 0, damFPedigree: 0, pedigree: {} });
    expect(r.method).toBe("F1");
  });
  it("mesma espécie, sem parentesco ENTRE os pais, mas um deles com endogamia PRÓPRIA (F_pedigree>0) → OUTCROSS de resgate", () => {
    const r = classifyCross({ ...base, sireId: "a", damId: "b", sireSpecies: "collie", damSpecies: "collie", sireFPedigree: 0.25, damFPedigree: 0, pedigree: {} });
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
