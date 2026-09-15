/**
 * Efeito materno no QTL porte (ADR-0014 — Walton & Hammond 1938).
 * Testes (a) anti-herança + controle negativo, (b) recíproco EXATO por
 * indivíduo + distribucional N=10.000 (complementar), (c') preview ==
 * cruzamento executado (Etapa 2b, correção item 2), (d) anti-P2W/determinismo.
 * (c) golden inalterado já é coberto pelos 4 arquivos golden/*.test.ts
 * (continuam 100% verdes, ver commit).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cross, enumerateOffspring, materializeCross, CANINE_PACK, type ParentInput } from "../index";
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
  const BIG = 0.9, SMALL = 0.1;
  // midparentBV é sempre (BIG+SMALL)/2 = 0.5 nas duas orientações — o único
  // insumo que muda entre orientações é QUEM é a mãe (e o adultPorte dela).
  const midparentBV = (BIG + SMALL) / 2;

  interface Pair {
    bv1: number; bv2: number; // BV do zigoto em cada orientação (deve ser IGUAL — mesma seed)
    adulto1: number; adulto2: number;
    nascimento1: number; nascimento2: number;
    clampedAdult: boolean; // clamp01() atuou em pelo menos um lado do par, pro campo adulto
    clampedNascimento: boolean; // idem, pro campo nascimento
  }

  // Δ (declarado explicitamente, mesmos termos do ADR-0014): diferença entre
  // recíprocos = m × (porteMãe₁ − porteMãe₂). Aqui mãe₁ = SMALL (orientação 1,
  // pai grande × mãe pequena) e mãe₂ = BIG (orientação 2, pai pequeno × mãe
  // grande) — a MESMA fêmea física trocando de papel, não uma "mãe" nova.
  const motherDiff = SMALL - BIG; // porteMãe₁ − porteMãe₂ = 0.1 − 0.9 = −0.8

  let pairs: Pair[];
  let clampAdultCount = 0;
  let clampBirthCount = 0;

  beforeAll(() => {
    pairs = [];
    for (let i = 0; i < N; i++) {
      // MESMA seed nas duas orientações: como parentA/parentB.genotype.loci
      // estão vazios (só QTL neste teste), generateGamete() não consome RNG e
      // o rng entra em segregateQtl() no MESMO estado nas duas chamadas — o
      // sorteio gaussiano do BV sai bit-a-bit idêntico (ver probe empírico:
      // bvMismatch=0/10000). É isso que permite a comparação EXATA abaixo.
      const seed = `recip-pair-${i}`;

      const sire1: ParentInput = { id: "s1", genotype: { loci: {}, qtl: { porte: BIG } }, generation: 0, sex: "M" };
      const dam1: ParentInput = { id: "d1", genotype: { loci: {}, qtl: { porte: SMALL } }, generation: 0, sex: "F", adultPorte: SMALL };
      const r1 = cross(sire1, dam1, "F1", seed, ctx);

      const sire2: ParentInput = { id: "s2", genotype: { loci: {}, qtl: { porte: SMALL } }, generation: 0, sex: "M" };
      const dam2: ParentInput = { id: "d2", genotype: { loci: {}, qtl: { porte: BIG } }, generation: 0, sex: "F", adultPorte: BIG };
      const r2 = cross(sire2, dam2, "F1", seed, ctx);

      const bv1 = r1.specimen.genotype.qtl.porte!;
      const bv2 = r2.specimen.genotype.qtl.porte!;

      // Valor PRÉ-clamp (recalculado aqui, fora do motor) só pra saber se
      // clamp01() truncou — usa o mesmo bv1/bv2 e midparentBV=0.5 fixos.
      const rawAdult1 = bv1 + cfg.mAdult * (SMALL - midparentBV);
      const rawAdult2 = bv2 + cfg.mAdult * (BIG - midparentBV);
      const rawBirth1 = bv1 + cfg.mBirth * (SMALL - midparentBV);
      const rawBirth2 = bv2 + cfg.mBirth * (BIG - midparentBV);
      const clampedAdult = rawAdult1 < 0 || rawAdult1 > 1 || rawAdult2 < 0 || rawAdult2 > 1;
      const clampedNascimento = rawBirth1 < 0 || rawBirth1 > 1 || rawBirth2 < 0 || rawBirth2 > 1;
      if (clampedAdult) clampAdultCount++;
      if (clampedNascimento) clampBirthCount++;

      pairs.push({
        bv1, bv2,
        adulto1: r1.specimen.phenotype.porteAdulto!, adulto2: r2.specimen.phenotype.porteAdulto!,
        nascimento1: r1.specimen.phenotype.porteNascimento!, nascimento2: r2.specimen.phenotype.porteNascimento!,
        clampedAdult, clampedNascimento,
      });
    }
  });

  it(`EXATO por indivíduo, N=${N}: mesma seed → mesmo BV; |Δporte − m×Δmãe| < 1e-9 (exclui clamp)`, () => {
    let excludedAdult = 0, excludedNascimento = 0;
    for (const p of pairs) {
      // mesma seed → mesmo BV, sempre (não é aproximação: é a mesma soma).
      expect(p.bv1).toBe(p.bv2);

      if (p.clampedAdult) { excludedAdult++; continue; }
      const expectedAdultDiff = cfg.mAdult * motherDiff;
      expect(Math.abs((p.adulto1 - p.adulto2) - expectedAdultDiff)).toBeLessThan(1e-9);
    }
    for (const p of pairs) {
      if (p.clampedNascimento) { excludedNascimento++; continue; }
      const expectedBirthDiff = cfg.mBirth * motherDiff;
      expect(Math.abs((p.nascimento1 - p.nascimento2) - expectedBirthDiff)).toBeLessThan(1e-9);
    }
    // Reporte explícito de quantos indivíduos o clamp afetou (excluídos da
    // igualdade exata acima — esperado, não é falha: ver "viés do clamp" na
    // ADR-0014). mAdult=0.25 é pequeno o bastante pra quase nunca saturar
    // nesta faixa (BIG/SMALL=0.9/0.1); mBirth=0.75 satura mais (~2.5%).
    console.log(`[recíproco exato] clamp adulto: ${clampAdultCount}/${N} | clamp nascimento: ${clampBirthCount}/${N}`);
    expect(excludedAdult).toBe(clampAdultCount);
    expect(excludedNascimento).toBe(clampBirthCount);
    expect(clampAdultCount).toBeLessThan(N); // sanidade: não pode ser 100% clampado
    expect(clampBirthCount).toBeLessThan(N);
  });

  it(`DISTRIBUCIONAL (complementar), N=${N}: média do swing recíproco ≈ m × (porteMãe₂ − porteMãe₁), tolerância ≤ 0.005`, () => {
    let adultDiffSum = 0, nascimentoDiffSum = 0, bvDiffSum = 0;
    for (const p of pairs) {
      bvDiffSum += p.bv1 - p.bv2;
      adultDiffSum += p.adulto2 - p.adulto1;
      nascimentoDiffSum += p.nascimento2 - p.nascimento1;
    }
    // BV: distribuição idêntica nas duas orientações (midparent=0.5 nos dois
    // casos) — a média das diferenças pareadas deve ser ~0.
    expect(Math.abs(bvDiffSum / N)).toBeLessThan(0.005);

    const expectedAdultSwing = cfg.mAdult * (BIG - SMALL); // = -m×motherDiff
    const expectedBirthSwing = cfg.mBirth * (BIG - SMALL);
    expect(Math.abs(adultDiffSum / N - expectedAdultSwing)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(nascimentoDiffSum / N - expectedBirthSwing)).toBeLessThanOrEqual(0.005);
  });
});

describe("Efeito materno (ADR-0014) — preview (enumerateOffspring) == cruzamento executado", () => {
  it("porteAdulto/porteNascimento do preview == materializeCross() para a mesma opção, mesmos pais", () => {
    const sire: ParentInput = { id: "sire-prev", genotype: { loci: {}, qtl: { porte: 0.7 } }, generation: 0, sex: "M" };
    const dam: ParentInput = { id: "dam-prev", genotype: { loci: {}, qtl: { porte: 0.3 } }, generation: 0, sex: "F", adultPorte: 0.85 };

    const options = enumerateOffspring(sire, dam, ctx, 6);
    expect(options.length).toBeGreaterThan(0);
    const chosen = options[0]!;
    expect(chosen.phenotype.porteAdulto).toBeDefined();
    expect(chosen.phenotype.porteNascimento).toBeDefined();

    // materializeCross() não re-sorteia QTL — usa o genótipo JÁ escolhido
    // (chosen.genotype, com qtl.porte já fixado pelo preview). A "mesma
    // seed" aqui é sobre reprodutibilidade do restante (X/fertilidade); o
    // efeito materno não depende de seed — é função pura do BV carregado.
    const materialized = materializeCross(sire, dam, "F1", "preview-materialize-01", ctx, chosen.genotype);

    expect(materialized.specimen.phenotype.porteAdulto).toBe(chosen.phenotype.porteAdulto);
    expect(materialized.specimen.phenotype.porteNascimento).toBe(chosen.phenotype.porteNascimento);
  });

  it("sem adultPorte da mãe conhecido: preview cai no BV puro (desvio materno = 0), igual ao motor", () => {
    const sire: ParentInput = { id: "sire-prev2", genotype: { loci: {}, qtl: { porte: 0.6 } }, generation: 0, sex: "M" };
    const dam: ParentInput = { id: "dam-prev2", genotype: { loci: {}, qtl: { porte: 0.4 } }, generation: 0, sex: "F" }; // sem adultPorte

    const options = enumerateOffspring(sire, dam, ctx, 6);
    const chosen = options[0]!;
    expect(chosen.phenotype.porteAdulto).toBe(chosen.genotype.qtl.porte);
    expect(chosen.phenotype.porteNascimento).toBe(chosen.genotype.qtl.porte);
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
