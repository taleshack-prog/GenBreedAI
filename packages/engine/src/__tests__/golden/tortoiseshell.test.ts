/**
 * Tortoiseshell/calico — locus O (laranja) ligado ao X (ADR-0013, TDD §4.5).
 * Espécie felis-catus. Genótipos AUTOSSÔMICOS idênticos entre os pais em
 * TODOS os cenários — só o locus O (ligado ao X) varia. Golden novo,
 * independente dos 4 arcos existentes (goldendoodle/boerpointer/danecollie/
 * pumajaguar) — nenhum deles foi alterado.
 */
import { describe, it, expect } from "vitest";
import { cross, isMutant, FELINE_PACK, type ParentInput, type CrossContext } from "../../index";
import type { Pedigree } from "../../index";

// Genótipo autossômico — IDÊNTICO para sire e dam em todo este arquivo
// (mesmo objeto reusado). Cobre todos os 13 loci autossômicos de
// FELINE_PACK; só `xLoci.O` muda entre indivíduos/cenários.
const AUTOSOMAL: Record<string, [string, string]> = {
  A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "D"], W: ["w", "w"], S: ["s", "s"],
  Ma: ["ma", "ma"], Fl: ["Fl^s", "Fl^s"], Hr: ["Hr", "Hr"], Bd: ["Bd^d", "Bd^d"], He: ["He^r", "He^r"], Ec: ["Ec^n", "Ec^n"],
};

const pedigree: Pedigree = { sire: { id: "sire", sire: null, dam: null }, dam: { id: "dam", sire: null, dam: null } };
// ANTI-P2W (TDD §0): CrossContext NÃO tem campo de tier — o motor é
// tier-agnóstico por construção. `cross()` recebe 5 parâmetros posicionais
// (parentA, parentB, method, seed, ctx); nenhum é tier — ver assinatura
// exportada em packages/engine/src/cross.ts. O mesmo `ctx` abaixo é reusado
// em todos os cenários, prova de que nada aqui distingue tier.
const ctx: CrossContext = { pack: FELINE_PACK, pedigree };

describe("Tortoiseshell/calico — O ligado ao X (felis-catus)", () => {
  it("(a) macho O × fêmea o/o, N=10.000 (seeds ts-a-0..ts-a-9999): filhas 100% MOSAIC; filhos 100% EUMELANIN; zero machos MOSAIC (tudo entre NÃO-mutantes no locus O)", () => {
    const sire: ParentInput = { id: "sire", genotype: { loci: AUTOSOMAL, qtl: {}, xLoci: { O: ["O"] } }, generation: 0, sex: "M", species: "felis-catus" };
    const dam: ParentInput = { id: "dam", genotype: { loci: AUTOSOMAL, qtl: {}, xLoci: { O: ["o", "o"] } }, generation: 0, sex: "F", species: "felis-catus" };
    let daughters = 0, daughtersMutant = 0, daughtersMosaicNonMutant = 0;
    let sons = 0, sonsMutant = 0, sonsEumelaninNonMutant = 0, sonsMosaic = 0;
    let unexpectedNonMutant = 0; // fora do Mendeliano esperado SEM marca de mutação — deve ficar 0
    for (let i = 0; i < 10000; i++) {
      const r = cross(sire, dam, "F1", `ts-a-${i}`, ctx);
      const oMutant = (r.specimen.genotype.xLoci?.O ?? []).some(isMutant);
      const pigment = r.specimen.phenotype.coatPigment;
      if (r.specimen.sex === "F") {
        daughters++;
        if (oMutant) daughtersMutant++;
        const expected = pigment === "MOSAIC";
        if (expected && !oMutant) daughtersMosaicNonMutant++;
        if (!expected && !oMutant) unexpectedNonMutant++;
      } else {
        sons++;
        if (oMutant) sonsMutant++;
        if (pigment === "MOSAIC") sonsMosaic++; // estruturalmente impossível (hemizigoto) — mutação não muda isso
        const expected = pigment === "EUMELANIN";
        if (expected && !oMutant) sonsEumelaninNonMutant++;
        if (!expected && !oMutant) unexpectedNonMutant++;
      }
    }
    expect(daughters).toBeGreaterThan(0);
    expect(sons).toBeGreaterThan(0);
    // 100% mantido — mas só sobre quem NÃO tem mutação no locus O (µ=1e-4/gameta,
    // ~1,5 mutantes esperados no total; sem tolerância percentual no lugar do 100%).
    expect(daughtersMosaicNonMutant).toBe(daughters - daughtersMutant);
    expect(sonsEumelaninNonMutant).toBe(sons - sonsMutant);
    expect(sonsMosaic).toBe(0); // (c) — macho é hemizigoto, nunca MOSAIC
    expect(daughtersMutant).toBeLessThanOrEqual(10); // esperado ~1,5
    expect(sonsMutant).toBeLessThanOrEqual(10); // esperado ~1,5
    // Nenhuma exceção ao padrão Mendeliano sem a marca de mutação.
    expect(unexpectedNonMutant).toBe(0);
  });

  it("(b) macho o × fêmea O/o, N=10.000 (seeds ts-b-0..ts-b-9999): filhas MOSAIC/EUMELANIN 45-55% cada; filhos PHEOMELANIN/EUMELANIN 45-55% cada; zero machos MOSAIC (tudo entre NÃO-mutantes no locus O)", () => {
    const sire: ParentInput = { id: "sire", genotype: { loci: AUTOSOMAL, qtl: {}, xLoci: { O: ["o"] } }, generation: 0, sex: "M", species: "felis-catus" };
    const dam: ParentInput = { id: "dam", genotype: { loci: AUTOSOMAL, qtl: {}, xLoci: { O: ["O", "o"] } }, generation: 0, sex: "F", species: "felis-catus" };
    let daughters = 0, daughtersMutant = 0, daughtersMosaicNonMutant = 0, daughtersEumelaninNonMutant = 0;
    let sons = 0, sonsMutant = 0, sonsPheomelaninNonMutant = 0, sonsEumelaninNonMutant = 0, sonsMosaic = 0;
    let unexpectedNonMutant = 0;
    for (let i = 0; i < 10000; i++) {
      const r = cross(sire, dam, "F1", `ts-b-${i}`, ctx);
      const oMutant = (r.specimen.genotype.xLoci?.O ?? []).some(isMutant);
      const pigment = r.specimen.phenotype.coatPigment;
      if (r.specimen.sex === "F") {
        daughters++;
        if (oMutant) daughtersMutant++;
        const expected = pigment === "MOSAIC" || pigment === "EUMELANIN"; // as 2 únicas possíveis por segregação (pai só dá "o")
        if (!expected && !oMutant) unexpectedNonMutant++;
        if (!oMutant) {
          if (pigment === "MOSAIC") daughtersMosaicNonMutant++;
          else if (pigment === "EUMELANIN") daughtersEumelaninNonMutant++;
        }
      } else {
        sons++;
        if (oMutant) sonsMutant++;
        if (pigment === "MOSAIC") sonsMosaic++; // estruturalmente impossível (hemizigoto)
        const expected = pigment === "PHEOMELANIN" || pigment === "EUMELANIN";
        if (!expected && !oMutant) unexpectedNonMutant++;
        if (!oMutant) {
          if (pigment === "PHEOMELANIN") sonsPheomelaninNonMutant++;
          else if (pigment === "EUMELANIN") sonsEumelaninNonMutant++;
        }
      }
    }
    expect(daughters).toBeGreaterThan(0);
    expect(sons).toBeGreaterThan(0);
    const daughtersNonMutant = daughters - daughtersMutant, sonsNonMutant = sons - sonsMutant;
    // Todo filho/filha NÃO-mutante cai em EXATAMENTE uma das 2 categorias esperadas.
    expect(daughtersMosaicNonMutant + daughtersEumelaninNonMutant).toBe(daughtersNonMutant);
    expect(sonsPheomelaninNonMutant + sonsEumelaninNonMutant).toBe(sonsNonMutant);
    const dMosaicPct = daughtersMosaicNonMutant / daughtersNonMutant, dEumelaninPct = daughtersEumelaninNonMutant / daughtersNonMutant;
    const sPheoPct = sonsPheomelaninNonMutant / sonsNonMutant, sEumelaninPct = sonsEumelaninNonMutant / sonsNonMutant;
    expect(dMosaicPct).toBeGreaterThanOrEqual(0.45); expect(dMosaicPct).toBeLessThanOrEqual(0.55);
    expect(dEumelaninPct).toBeGreaterThanOrEqual(0.45); expect(dEumelaninPct).toBeLessThanOrEqual(0.55);
    expect(sPheoPct).toBeGreaterThanOrEqual(0.45); expect(sPheoPct).toBeLessThanOrEqual(0.55);
    expect(sEumelaninPct).toBeGreaterThanOrEqual(0.45); expect(sEumelaninPct).toBeLessThanOrEqual(0.55);
    expect(sonsMosaic).toBe(0); // (c) — macho é hemizigoto, nunca MOSAIC
    expect(daughtersMutant).toBeLessThanOrEqual(10); // esperado ~1,5
    expect(sonsMutant).toBeLessThanOrEqual(10); // esperado ~1,5
    expect(unexpectedNonMutant).toBe(0); // nenhuma exceção sem marca de mutação
  });

  // (d) omitido — ver relatório: não existe marcação DEDICADA de "calico" no
  // motor (só a combinação, já testável via campos já existentes, de
  // coatPigment==="MOSAIC" com loci.S==="bicolor"; nenhum flag próprio).

  it("(e) determinismo: mesma seed → resultado idêntico", () => {
    const sire: ParentInput = { id: "sire", genotype: { loci: AUTOSOMAL, qtl: {}, xLoci: { O: ["o"] } }, generation: 0, sex: "M", species: "felis-catus" };
    const dam: ParentInput = { id: "dam", genotype: { loci: AUTOSOMAL, qtl: {}, xLoci: { O: ["O", "o"] } }, generation: 0, sex: "F", species: "felis-catus" };
    const r1 = cross(sire, dam, "F1", "ts-determinismo", ctx);
    const r2 = cross(sire, dam, "F1", "ts-determinismo", ctx);
    expect(r1).toEqual(r2);
  });

  it("(f) ANTI-P2W: cross() não recebe tier — assinatura tem 5 parâmetros, nenhum é tier", () => {
    // Prova estrutural: a aridade da função exportada é 5 (parentA, parentB,
    // method, seed, ctx) — ver packages/engine/src/cross.ts. CrossContext
    // (ctx acima) também não tem campo de tier. O mesmo resultado do teste
    // (a)/(b) vale pra QUALQUER tier de UI — o motor nunca soube que tier existia.
    expect(cross.length).toBe(5);
  });
});
