/**
 * ADR-0018 — macho cuja ascendência mistura mais de uma espécie biológica é
 * estéril, em QUALQUER método (BC1, F2, OUTCROSS, ...), não só F1. NÃO é
 * golden: nenhum dos 4 arcos existentes é tocado por este teste.
 */
import { describe, it, expect } from "vitest";
import { cross, enumerateOffspring, FELINE_PACK, type ParentInput, type CrossContext } from "../index";
import type { Pedigree } from "../index";
import { DELTA_F1, ONCA_NEGRA, PUMAJAGUAR_PEDIGREE } from "./fixtures";

const AUTOSOMAL: Record<string, [string, string]> = {
  A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "D"], W: ["w", "w"], S: ["s", "s"],
  Ma: ["ma", "ma"], Fl: ["Fl^s", "Fl^s"], Hr: ["Hr", "Hr"], Bd: ["Bd^d", "Bd^d"], He: ["He^r", "He^r"], Ec: ["Ec^n", "Ec^n"],
};

function ctxFor(ids: string[]): CrossContext {
  const pedigree: Pedigree = Object.fromEntries(ids.map((id) => [id, { id, sire: null, dam: null }]));
  return { pack: FELINE_PACK, pedigree };
}

/** Acha, entre seeds `${base}-0..max`, uma que dê filho do sexo pedido. */
function firstSeedForSex(parentA: ParentInput, parentB: ParentInput, ctx: CrossContext, method: "BC1" | "F2", sex: "M" | "F", base: string, max = 50): string {
  for (let i = 0; i < max; i++) {
    const seed = `${base}-${i}`;
    if (cross(parentA, parentB, method, seed, ctx).specimen.sex === sex) return seed;
  }
  throw new Error(`firstSeedForSex: nenhuma seed "${base}-0".."${base}-${max - 1}" deu sexo ${sex}.`);
}

describe("ADR-0018 — macho híbrido estéril além do F1", () => {
  it("BC1: fêmea F1 'puma×panthera-onca' × macho 'panthera-onca' → prole MACHO estéril (score=0); prole FÊMEA mantém faixa BC1 (60-80)", () => {
    const damF1: ParentInput = { id: "damF1", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 1, sex: "F", species: "puma×panthera-onca" };
    const sireOnca: ParentInput = { id: "sireOnca", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 0, sex: "M", species: "panthera-onca" };
    const ctx = ctxFor(["damF1", "sireOnca"]);

    const seedM = firstSeedForSex(sireOnca, damF1, ctx, "BC1", "M", "adr18-bc1");
    const rMale = cross(sireOnca, damF1, "BC1", seedM, ctx);
    expect(rMale.specimen.sex).toBe("M");
    expect(rMale.specimen.fertility.score).toBe(0);
    expect(rMale.specimen.fertility.haldaneStatus).toBe("STERILE");
    expect(rMale.specimen.fertility.haldaneSterile).toBe(true);
    expect(rMale.specimen.fertility.notes.join(" ")).toContain("ADR-0018");

    const seedF = firstSeedForSex(sireOnca, damF1, ctx, "BC1", "F", "adr18-bc1f");
    const rFemale = cross(sireOnca, damF1, "BC1", seedF, ctx);
    expect(rFemale.specimen.sex).toBe("F");
    expect(rFemale.specimen.fertility.score).toBeGreaterThanOrEqual(60);
    expect(rFemale.specimen.fertility.score).toBeLessThanOrEqual(80);
    expect(rFemale.specimen.fertility.haldaneStatus).toBe("NONE"); // BC1 não mexe em haldaneStatus fora da ADR-0018
  });

  it("F2 entre híbridos ('puma×panthera-onca' × 'panthera-onca×puma'): prole MACHO estéril; prole FÊMEA mantém faixa F2 (30-50)", () => {
    // Ordem trocada de propósito (dedupe/união não depende de ordem dos componentes).
    const sireF1: ParentInput = { id: "sireF1", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 1, sex: "M", species: "puma×panthera-onca" };
    const damF1: ParentInput = { id: "damF1b", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 1, sex: "F", species: "panthera-onca×puma" };
    const ctx = ctxFor(["sireF1", "damF1b"]);

    const seedM = firstSeedForSex(sireF1, damF1, ctx, "F2", "M", "adr18-f2");
    const rMale = cross(sireF1, damF1, "F2", seedM, ctx);
    expect(rMale.specimen.sex).toBe("M");
    expect(rMale.specimen.fertility.score).toBe(0);
    expect(rMale.specimen.fertility.haldaneStatus).toBe("STERILE");

    const seedF = firstSeedForSex(sireF1, damF1, ctx, "F2", "F", "adr18-f2f");
    const rFemale = cross(sireF1, damF1, "F2", seedF, ctx);
    expect(rFemale.specimen.sex).toBe("F");
    expect(rFemale.specimen.fertility.score).toBeGreaterThanOrEqual(30);
    expect(rFemale.specimen.fertility.score).toBeLessThanOrEqual(50);
    expect(rFemale.specimen.fertility.haldaneStatus).toBe("NONE");
  });

  it("intraespécie BC1 (1 componente só) — macho NÃO fica estéril pela ADR-0018", () => {
    const sire: ParentInput = { id: "sireOnca2", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 0, sex: "M", species: "panthera-onca" };
    const dam: ParentInput = { id: "damOnca2", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 0, sex: "F", species: "panthera-onca" };
    const ctx = ctxFor(["sireOnca2", "damOnca2"]);
    const seedM = firstSeedForSex(sire, dam, ctx, "BC1", "M", "adr18-intra");
    const r = cross(sire, dam, "BC1", seedM, ctx);
    expect(r.specimen.sex).toBe("M");
    expect(r.specimen.fertility.score).toBeGreaterThan(0);
    expect(r.specimen.fertility.haldaneStatus).toBe("NONE");
    expect(r.specimen.fertility.haldaneSterile).toBe(false);
  });

  it("determinismo: mesma seed → mesmo resultado; rng não consumido a mais (mesmo genótipo de antes da regra)", () => {
    const damF1: ParentInput = { id: "damF1c", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 1, sex: "F", species: "puma×panthera-onca" };
    const sireOnca: ParentInput = { id: "sireOnca3", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 0, sex: "M", species: "panthera-onca" };
    const ctx = ctxFor(["damF1c", "sireOnca3"]);
    const r1 = cross(sireOnca, damF1, "BC1", "adr18-determinismo", ctx);
    const r2 = cross(sireOnca, damF1, "BC1", "adr18-determinismo", ctx);
    expect(r1).toEqual(r2);
    // A regra só sobrescreve fertility.* — o zigoto (loci/qtl/xLoci) é
    // idêntico ao que sairia sem a ADR-0018 (nenhum rng extra foi consumido
    // pra chegar até aqui, então o genótipo não muda com a regra ligada).
    expect(r1.specimen.genotype).toEqual(r2.specimen.genotype);
  });
});

describe("Pumajaguar BC1 — cobertura de fertilidade sob depressão movida do golden (ADR-0018)", () => {
  // MESMO par/ctx do golden (packages/engine/src/__tests__/golden/pumajaguar.test.ts):
  // negra (macho, "panthera-onca") × delta (fêmea F1, "puma×panthera-onca"),
  // F_pedigree=0.25. Na seed "pj-01" a prole é MACHO → estéril pela ADR-0018
  // (ver golden). Aqui cobrimos o caso FÊMEA do MESMO par/ctx — que não
  // aciona a ADR-0018 (Haldane/esterilidade estendida é só sobre machos) —
  // com a asserção de fertilidade sob depressão que antes vivia no golden.
  const negra: ParentInput = { id: "negra", genotype: ONCA_NEGRA, generation: 0, sex: "M", species: "panthera-onca" };
  const delta: ParentInput = { id: "delta", genotype: DELTA_F1, generation: 1, sex: "F", fertility: 10, species: "puma×panthera-onca" };
  const ctx: CrossContext = { pack: FELINE_PACK, pedigree: PUMAJAGUAR_PEDIGREE, interspecific: true, targetLoci: ["A"], generationsUnderSelection: 2 };

  it("BC1 (F=0.25), prole FÊMEA (seeds pj-f-0..pj-f-49) → sem Haldane, fertilidade sob depressão em [48,64]", () => {
    const seed = firstSeedForSex(negra, delta, ctx, "BC1", "F", "pj-f");
    const r = cross(negra, delta, "BC1", seed, ctx);
    expect(r.specimen.sex).toBe("F");
    expect(r.specimen.fertility.haldaneStatus).toBe("NONE");
    expect(r.specimen.fertility.haldaneSterile).toBe(false);
    // Faixa removida do golden (ele nunca a afirmava explicitamente, mas é a
    // mesma "fertilidade sob depressão" do título antigo do it()): BC1 base
    // [60,80] (fertility.ts) × penalidade de depressão endogâmica pra F=0.25
    // (>0.15): steps=(0.25-0.15)/0.05=2, penalty=2*0.1=0.2, score=base*0.8
    // → [48,64].
    expect(r.specimen.fertility.score).toBeGreaterThanOrEqual(48);
    expect(r.specimen.fertility.score).toBeLessThanOrEqual(64);
  });
});

describe("enumerateOffspring — maleSterile (aviso de esterilidade na prévia de opções, ADR-0018)", () => {
  it("tigre × leão (interespecífico) → toda opção vem com maleSterile true", () => {
    const tigre: ParentInput = { id: "tigre", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 0, sex: "M", species: "panthera-tigris" };
    const leoa: ParentInput = { id: "leoa", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 0, sex: "F", species: "panthera-leo" };
    const ctx = ctxFor(["tigre", "leoa"]);
    const options = enumerateOffspring(tigre, leoa, ctx);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) expect(o.maleSterile).toBe(true);
  });

  it("leão × leão (intraespécie) → toda opção vem com maleSterile false", () => {
    const leao: ParentInput = { id: "leao2", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 0, sex: "M", species: "panthera-leo" };
    const leoa: ParentInput = { id: "leoa2", genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 0, sex: "F", species: "panthera-leo" };
    const ctx = ctxFor(["leao2", "leoa2"]);
    const options = enumerateOffspring(leao, leoa, ctx);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) expect(o.maleSterile).toBe(false);
  });
});
