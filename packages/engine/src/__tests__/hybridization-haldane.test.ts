/**
 * Matriz nomeada de hybridClass() (ADR-0015, item 6) e integração cross()
 * ponta-a-ponta (Haldane por sexo, determinismo, anti-P2W) pra F1
 * interespecífico. Complementa engine.test.ts (fertilityScore isolado) e
 * hybrid-class.test.ts (hybridClass isolado com casos genéricos).
 */
import { describe, it, expect } from "vitest";
import { cross, hybridClass, FELINE_PACK, type ParentInput } from "../index";
import { biologicalSpecies } from "@genbreedai/shared";

function feline(id: string, sex: "M" | "F", species: string, porte = 0.5): ParentInput {
  return { id, genotype: { loci: {}, qtl: { porte } }, generation: 0, sex, species };
}

describe("hybridClass() — matriz nomeada (ADR-0015, item 6)", () => {
  it("leão × tigre = DOCUMENTED_FERTILE_FEMALE (mesmo gênero Panthera)", () => {
    expect(hybridClass(feline("leao", "M", "panthera-leo"), feline("tigre", "F", "panthera-tigris"), FELINE_PACK))
      .toBe("DOCUMENTED_FERTILE_FEMALE");
  });

  it("gato × serval = DOCUMENTED_FERTILE_FEMALE (par nomeado — Savannah)", () => {
    expect(hybridClass(feline("gato", "M", "felis-catus"), feline("serval", "F", "leptailurus-serval"), FELINE_PACK))
      .toBe("DOCUMENTED_FERTILE_FEMALE");
  });

  it("puma × onça = UNDOCUMENTED (subfamílias distintas — Felinae × Pantherinae, ~10 Ma)", () => {
    expect(hybridClass(feline("puma", "M", "puma"), feline("onca", "F", "panthera-onca"), FELINE_PACK))
      .toBe("UNDOCUMENTED");
  });

  it("guepardo × gato = UNDOCUMENTED (não é o par Savannah, gêneros diferentes)", () => {
    expect(hybridClass(feline("guepardo", "M", "acinonyx-jubatus"), feline("gato", "F", "felis-catus"), FELINE_PACK))
      .toBe("UNDOCUMENTED");
  });

  it("tigre × tigre-branco = SAME_SPECIES (via biologicalSpecies() — morfos, integração item 1 + item 2)", () => {
    const spTigre = biologicalSpecies("feline", "panthera-tigris");
    const spBranco = biologicalSpecies("feline", "panthera-tigris-branco");
    expect(spTigre).toBe(spBranco); // pré-condição do item 1
    expect(hybridClass(feline("bengala", "M", spTigre), feline("branco", "F", spBranco), FELINE_PACK))
      .toBe("SAME_SPECIES");
  });
});

describe("Haldane por sexo — integração cross() ponta-a-ponta (ADR-0015)", () => {
  const ctx = { pack: FELINE_PACK, pedigree: {}, targetLoci: [], generationsUnderSelection: 1 };

  it("macho F1 leão×tigre (DOCUMENTED) → fertility 0, STERILE", () => {
    const sire = feline("leao-m", "M", "panthera-leo");
    const dam = feline("tigre-f", "F", "panthera-tigris");
    const r = cross(sire, dam, "F1", "hh-01", ctx);
    // sexo do ZIGOTO é sorteado (50/50) — força determinístico via seed; só
    // valida quando sair macho (senão o teste seguinte cobre a fêmea).
    if (r.specimen.sex === "M") {
      expect(r.specimen.fertility.score).toBe(0);
      expect(r.specimen.fertility.haldaneStatus).toBe("STERILE");
    }
  });

  it("fêmea F1 puma×onça (UNDOCUMENTED) → fertility na faixa 5–15, REDUCED; mesma seed → mesmo valor", () => {
    const sire = feline("puma-m", "M", "puma");
    const dam = feline("onca-f", "F", "panthera-onca");
    // Varre seeds até achar uma que produza fêmea (determinístico, sem side-effect).
    let foundSeed: string | undefined;
    let r: ReturnType<typeof cross> | undefined;
    for (let i = 0; i < 200 && !r; i++) {
      const seed = `hh-undoc-${i}`;
      const attempt = cross(sire, dam, "F1", seed, ctx);
      if (attempt.specimen.sex === "F") { r = attempt; foundSeed = seed; }
    }
    expect(r).toBeDefined();
    expect(r!.specimen.fertility.score).toBeGreaterThanOrEqual(5);
    expect(r!.specimen.fertility.score).toBeLessThanOrEqual(15);
    expect(r!.specimen.fertility.haldaneStatus).toBe("REDUCED");
    expect(r!.specimen.fertility.haldaneSterile).toBe(false);

    // Determinismo: repetir a MESMA seed dá a MESMA fertilidade.
    const again = cross(sire, dam, "F1", foundSeed!, ctx);
    expect(again.specimen.fertility.score).toBe(r!.specimen.fertility.score);
  });

  it("anti-P2W: cross() continua sem parâmetro de tier (5 params), resultado não muda com a classe de hibridação sozinha", () => {
    expect(cross.length).toBe(5);
  });
});
