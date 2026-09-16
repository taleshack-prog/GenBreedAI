import { describe, it, expect } from "vitest";
import { cross, punnettLocus, genotypeProbability, wrightF, FELINE_PACK, SterileParentError, type ParentInput } from "../../index";
import { DELTA_F1, ONCA_NEGRA, PUMAJAGUAR_PEDIGREE } from "../fixtures";
const D = DELTA_F1.loci, N = ONCA_NEGRA.loci;

/**
 * ADR-0015 (item 5): Delta é o F1 macho (Puma × Onça) — sexo heterogamético
 * (XY). Pela Regra de Haldane corretamente aplicada (ADR-0015, corrige a
 * etapa 2c/relatório Haldane), um macho F1 interespecífico é ESTÉRIL, nunca
 * fértil o bastante pra sirar um BC1. O fixture original (Delta macho, sire)
 * era biologicamente impossível — corrigido aqui: Delta vira FÊMEA e passa a
 * ser DAM (sexo homogamético, pode ter fertilidade reduzida mas não-zero,
 * exatamente o que a Regra de Haldane prevê); Onça Negra vira MACHO e passa
 * a ser SIRE. `species` de `delta` (agora OBRIGATÓRIO — ADR-0015, correção
 * pós-Etapa-2c) usa `"puma×panthera-onca"` — a MESMA convenção de
 * composição por "×" que `combineSpecies()` (apps/api) já usa pra nomear
 * híbridos; não é uma `biologicalSpecies` real inventada, é o registro
 * literal de que Delta É o F1 desses dois parentais (reflete o pedigree,
 * não uma nova espécie fabricada). Esse valor nunca colide com nenhuma
 * chave de `speciesGenus`/whitelist, então `hybridClass()` nunca a trata
 * como SAME_SPECIES nem como par documentado por acidente. `negra` é onça
 * pura, species setado normalmente. O método continua BC1 (retrocruzamento
 * ao parental onça) — só a ORIENTAÇÃO sire/dam mudou, não o método nem os
 * genótipos/QTL.
 */
const delta: ParentInput = { id: "delta", genotype: DELTA_F1, generation: 1, sex: "F", fertility: 10, species: "puma×panthera-onca" }; // fêmea F1 UNDOCUMENTED (Puma×Panthera, subfamílias distintas) — fixo em [5,15], ver ADR-0015
const negra: ParentInput = { id: "negra", genotype: ONCA_NEGRA, generation: 0, sex: "M", species: "panthera-onca" };
const ctx = { pack: FELINE_PACK, pedigree: PUMAJAGUAR_PEDIGREE, interspecific: true, targetLoci: ["A"], generationsUnderSelection: 2 };
describe("Pumajaguar BC1 (TDD §4.5; sexo/fertilidade — ADR-0015 item 5)", () => {
  it("F_pedigree = 0.25 (retrocruzamento ao progenitor) — simétrico, independe de quem é sire/dam", () => {
    expect(wrightF(PUMAJAGUAR_PEDIGREE, "delta", "negra")).toBe(0.25);
    expect(wrightF(PUMAJAGUAR_PEDIGREE, "negra", "delta")).toBe(0.25);
  });
  it("fixação do melanismo: P(A_)=0.75, P(AA)=0.25", () => {
    const d = punnettLocus(D.A!, N.A!);
    expect(d.get("A/A")).toBe(0.25); expect(d.get("A/a")).toBe(0.5); expect(d.get("a/a")).toBe(0.25);
    expect(genotypeProbability(D.A!,N.A!,"A/A") + genotypeProbability(D.A!,N.A!,"A/a")).toBe(0.75);
  });
  it("IF = 0.857143, prole A/A na seed pj-01 (TDD §4.3; 'IF≈0.03' do TDD é impossível — ADR-0004)", () => {
    const r = cross(negra, delta, "BC1", "pj-01", ctx);
    // Errata do ADR-0004 (2026-09-15): o locus A da prole, sob a seed
    // "pj-01", sai HOMOZIGOTO A/A (H_alvo = 1 — fixado), não heterozigoto
    // como o ADR registrou originalmente. Confirmado de forma independente
    // no motor da main (481efb7) e nesta branch, nas duas orientações
    // sire/dam.
    expect(r.specimen.genotype.loci.A).toEqual(["A", "A"]);
    const expectedIF = 0.5 * 1 + 0.3 * Math.min(1, 0.25 / 0.25) + 0.2 * Math.min(1, 2 / 7);
    expect(r.specimen.fixationIndex).toBeCloseTo(expectedIF, 6); // motor arredonda a 6 casas
    expect(r.specimen.fixationIndex).toBe(0.857143);
  });
  it("BC1 (F=0.25), prole macho na seed pj-01 → estéril (ADR-0018); determinístico", () => {
    const r = cross(negra, delta, "BC1", "pj-01", ctx);
    // Premissa (ADR-0018): a prole desse BC1, sob a seed "pj-01", é MACHO —
    // e sua ascendência mistura mais de uma espécie biológica (negra =
    // "panthera-onca", 1 componente; delta = "puma×panthera-onca", 2
    // componentes — união = 2), então é estéril em QUALQUER método, não só
    // F1. Consequência direta e aprovada da regra (não é bug).
    expect(r.specimen.sex).toBe("M");
    expect(r.specimen.fertility.haldaneStatus).toBe("STERILE");
    expect(r.specimen.fertility.haldaneSterile).toBe(true);
    expect(r.specimen.fertility.score).toBe(0);
    expect(r.specimen.fertility.inviabilityRisk).toBe(0);
    expect(cross(negra, delta, "BC1", "pj-01", ctx)).toEqual(r);
  });
  it("gate de fertilidade (item 4): fixture ANTIGO (Delta macho F1, fertility=0) como sire → cross() rejeita", () => {
    const deltaMaleSterile: ParentInput = { id: "delta-macho-antigo", genotype: DELTA_F1, generation: 1, sex: "M", fertility: 0, species: "puma×panthera-onca" };
    const negraDam: ParentInput = { id: "negra-dam", genotype: ONCA_NEGRA, generation: 0, sex: "F", species: "panthera-onca" };
    expect(() => cross(deltaMaleSterile, negraDam, "BC1", "pj-neg-01", ctx)).toThrow(SterileParentError);
  });
});
