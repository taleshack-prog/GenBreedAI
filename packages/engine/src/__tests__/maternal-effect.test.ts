/**
 * Efeito materno no QTL porte (ADR-0014 — Walton & Hammond 1938).
 * Testes (a) anti-herança + controle negativo, (b) recíproco N=10.000,
 * (d) anti-P2W/determinismo. (c) golden inalterado já é coberto pelos 4
 * arquivos golden/*.test.ts (continuam 100% verdes, ver commit).
 */
import { describe, it, expect } from "vitest";
import { cross, CANINE_PACK, type ParentInput } from "../index";
import type { Genotype } from "@genbreedai/shared";

const ctx = { pack: CANINE_PACK, pedigree: {} };
const cfg = CANINE_PACK.maternalEffect!.porte!;
const FIXED_SIRE_BV = 0.5;

function sireInput(id: string): ParentInput {
  return { id, genotype: { loci: {}, qtl: { porte: FIXED_SIRE_BV } }, generation: 0, sex: "M" };
}

describe("Efeito materno (ADR-0014) — anti-herança", () => {
  it("CORRETO: efeito materno só no phenotype → BV não deriva em 10 gerações", () => {
    let damGenotype: Genotype = { loci: {}, qtl: { porte: FIXED_SIRE_BV } };
    let damAdultPorte: number | undefined = 0.95; // fundadora "grande" fenotipicamente
    const bvSeries: number[] = [FIXED_SIRE_BV];
    for (let gen = 0; gen < 10; gen++) {
      const dam: ParentInput = { id: `dam-${gen}`, genotype: damGenotype, generation: gen, sex: "F", adultPorte: damAdultPorte };
      const r = cross(sireInput(`sire-${gen}`), dam, "F1", `anti-drift-${gen}`, ctx);
      bvSeries.push(r.specimen.genotype.qtl.porte!);
      damGenotype = r.specimen.genotype; // BV segue geração a geração
      damAdultPorte = r.specimen.phenotype.porteAdulto; // fenótipo, não BV
    }
    // Comparação direta ponta-a-ponta (não janela deslizante): o sire fixo em
    // 0.5 toda geração âncora o BV — sem deriva, a 10ª geração fica perto de
    // onde começou, só com o ruído normal da segregação (ADR-0012).
    expect(Math.abs(bvSeries[bvSeries.length - 1]! - bvSeries[0]!)).toBeLessThan(0.15);
  });

  it("CONTROLE NEGATIVO: se o efeito materno FOSSE gravado no BV, a linhagem deriva de verdade", () => {
    // Simulação deliberadamente ERRADA (fora do motor) pra provar que o teste
    // acima pegaria a regressão se alguém gravasse porteAdulto em genotype.qtl.
    let bv = FIXED_SIRE_BV;
    const bvSeries = [bv];
    for (let gen = 0; gen < 10; gen++) {
      const midparent = (FIXED_SIRE_BV + bv) / 2;
      const deviation = 0.95 - midparent;
      bv = Math.max(0, Math.min(1, midparent + cfg.mAdult * deviation)); // ERRADO DE PROPÓSITO
      bvSeries.push(bv);
    }
    expect(bvSeries[bvSeries.length - 1]! - bvSeries[0]!).toBeGreaterThan(0.15); // deriva real — prova que o teste acima é sensível ao bug
  });
});

describe("Efeito materno (ADR-0014) — recíproco", () => {
  const N = 10_000;

  function sampleOrientation(sireBV: number, damBV: number, damAdultPorte: number, seedPrefix: string) {
    let bvSum = 0, adultSum = 0, birthSum = 0;
    for (let i = 0; i < N; i++) {
      const sire: ParentInput = { id: "s", genotype: { loci: {}, qtl: { porte: sireBV } }, generation: 0, sex: "M" };
      const dam: ParentInput = { id: "d", genotype: { loci: {}, qtl: { porte: damBV } }, generation: 0, sex: "F", adultPorte: damAdultPorte };
      const r = cross(sire, dam, "F1", `${seedPrefix}-${i}`, ctx);
      bvSum += r.specimen.genotype.qtl.porte!;
      adultSum += r.specimen.phenotype.porteAdulto!;
      birthSum += r.specimen.phenotype.porteNascimento!;
    }
    return { bv: bvSum / N, adulto: adultSum / N, nascimento: birthSum / N };
  }

  it(`pai grande(BV=0.9) × mãe pequena(0.1) vs. inverso, N=${N}: BV igual; porteAdulto/porteNascimento diferem em m×Δ`, () => {
    const BIG = 0.9, SMALL = 0.1;
    const o1 = sampleOrientation(BIG, SMALL, SMALL, "recip-1"); // pai grande, mãe pequena
    const o2 = sampleOrientation(SMALL, BIG, BIG, "recip-2"); // inverso: pai pequeno, mãe grande

    // BV: mesma distribuição nas duas orientações (midparent = 0.5 nos dois casos).
    expect(Math.abs(o1.bv - o2.bv)).toBeLessThan(0.02);

    // Δ = |damAdultPorte − médiaParentalBV| = |0.1/0.9 − 0.5| = 0.4 nas duas orientações,
    // com sinal oposto → a diferença entre orientações é 2×m×Δ.
    const delta = 0.4;
    const expectedAdultSwing = 2 * cfg.mAdult * delta;
    const expectedBirthSwing = 2 * cfg.mBirth * delta;
    expect(Math.abs((o2.adulto - o1.adulto) - expectedAdultSwing)).toBeLessThan(0.03);
    expect(Math.abs((o2.nascimento - o1.nascimento) - expectedBirthSwing)).toBeLessThan(0.03);
  });
});

describe("Efeito materno (ADR-0014) — anti-P2W e determinismo", () => {
  it("mesma seed + mesmo adultPorte → porteAdulto/porteNascimento idênticos (determinístico)", () => {
    const sire = sireInput("sire");
    const dam: ParentInput = { id: "dam", genotype: { loci: {}, qtl: { porte: 0.5 } }, generation: 0, sex: "F", adultPorte: 0.8 };
    const r1 = cross(sire, dam, "F1", "det-me-01", ctx);
    const r2 = cross(sire, dam, "F1", "det-me-01", ctx);
    expect(r1.specimen.phenotype.porteAdulto).toBe(r2.specimen.phenotype.porteAdulto);
    expect(r1.specimen.phenotype.porteNascimento).toBe(r2.specimen.phenotype.porteNascimento);
  });

  it("cross() continua sem receber tier — anti-P2W estrutural preservado (5 params)", () => {
    expect(cross.length).toBe(5);
  });
});
