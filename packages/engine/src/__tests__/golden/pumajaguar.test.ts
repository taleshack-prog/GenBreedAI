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
 * a ser SIRE. `species` deliberadamente NÃO setado em `delta` — ela é um
 * híbrido F1, não tem uma `biologicalSpecies` única no catálogo (setar
 * qualquer uma seria inventar taxonomia); `negra` é onça pura, species
 * setado. O método continua BC1 (retrocruzamento ao parental onça) — só a
 * ORIENTAÇÃO sire/dam mudou, não o método nem os genótipos/QTL.
 */
const delta: ParentInput = { id: "delta", genotype: DELTA_F1, generation: 1, sex: "F", fertility: 10 }; // fêmea F1 UNDOCUMENTED (Puma×Panthera, subfamílias distintas) — fixo em [5,15], ver ADR-0015
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
  it("IF corrigido ≥ 0.30 (o 'IF≈0.03' do TDD é impossível — ADR-0004) — valor INALTERADO pela inversão sire/dam", () => {
    expect(cross(negra, delta, "BC1", "pj-01", ctx).specimen.fixationIndex).toBeGreaterThanOrEqual(0.3);
  });
  it("BC1 sob depressão (F=0.25); sem Haldane (não é F1); determinístico", () => {
    const r = cross(negra, delta, "BC1", "pj-01", ctx);
    expect(r.specimen.fertility.haldaneStatus).toBe("NONE");
    expect(r.specimen.fertility.haldaneSterile).toBe(false);
    expect(r.specimen.fertility.inviabilityRisk).toBe(0);
    expect(cross(negra, delta, "BC1", "pj-01", ctx)).toEqual(r);
  });
  it("gate de fertilidade (item 4): fixture ANTIGO (Delta macho F1, fertility=0) como sire → cross() rejeita", () => {
    const deltaMaleSterile: ParentInput = { id: "delta-macho-antigo", genotype: DELTA_F1, generation: 1, sex: "M", fertility: 0 };
    const negraDam: ParentInput = { id: "negra-dam", genotype: ONCA_NEGRA, generation: 0, sex: "F" };
    expect(() => cross(deltaMaleSterile, negraDam, "BC1", "pj-neg-01", ctx)).toThrow(SterileParentError);
  });
});
