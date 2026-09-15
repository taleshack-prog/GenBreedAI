/**
 * hybridClass() — classe de hibridação (ADR-0015, Etapa 2c, item 2). Deriva
 * SEMPRE de ParentInput.species (identidade biológica dos pais), NUNCA do
 * método da cruza. A matriz completa pedida no item 6 (leão×tigre, gato×
 * serval, puma×onça, guepardo×gato, tigre×tigre-branco) está em
 * hybridization-haldane.test.ts, junto dos testes de fertilityScore/cross()
 * que dependem dela — aqui só a função isolada.
 */
import { describe, it, expect } from "vitest";
import { hybridClass, FELINE_PACK, CANINE_PACK, type ParentInput } from "../index";

function p(id: string, sex: "M" | "F", species?: string): ParentInput {
  return { id, genotype: { loci: {}, qtl: {} }, generation: 0, sex, species };
}

describe("hybridClass() (ADR-0015)", () => {
  it("mesma biologicalSpecies → SAME_SPECIES", () => {
    expect(hybridClass(p("a", "M", "panthera-tigris"), p("b", "F", "panthera-tigris"), FELINE_PACK)).toBe("SAME_SPECIES");
  });

  it("par do gênero Panthera (whitelist genérica) → DOCUMENTED_FERTILE_FEMALE", () => {
    expect(hybridClass(p("leao", "M", "panthera-leo"), p("onca", "F", "panthera-onca"), FELINE_PACK)).toBe("DOCUMENTED_FERTILE_FEMALE");
  });

  it("par nomeado explícito (felis-catus × leptailurus-serval) → DOCUMENTED_FERTILE_FEMALE", () => {
    expect(hybridClass(p("gato", "M", "felis-catus"), p("serval", "F", "leptailurus-serval"), FELINE_PACK)).toBe("DOCUMENTED_FERTILE_FEMALE");
  });

  it("par interespecífico fora da whitelist → UNDOCUMENTED", () => {
    expect(hybridClass(p("puma", "M", "puma"), p("onca", "F", "panthera-onca"), FELINE_PACK)).toBe("UNDOCUMENTED");
  });

  it("espécie ausente em QUALQUER lado → SAME_SPECIES (conservador de verdade: nunca inventa interespecificidade sem dado)", () => {
    // `species` é campo novo/opcional — a esmagadora maioria dos chamadores
    // ainda não o preenche (ex.: todo golden canino). Tratar isso como
    // UNDOCUMENTED acionaria Haldane em cruzas comuns nunca marcadas como
    // interespecíficas — bug real encontrado ao rodar os goldens (ver commit).
    expect(hybridClass(p("a", "M"), p("b", "F", "panthera-onca"), FELINE_PACK)).toBe("SAME_SPECIES");
    expect(hybridClass(p("a", "M"), p("b", "F"), FELINE_PACK)).toBe("SAME_SPECIES");
  });

  it("pack canino: toda raça sem `species` → SAME_SPECIES, nunca crasha", () => {
    expect(hybridClass(p("a", "M"), p("b", "F"), CANINE_PACK)).toBe("SAME_SPECIES");
  });

  it("classe deriva do PAR de espécies, não do method — hybridClass não recebe method", () => {
    expect(hybridClass.length).toBe(3); // (parentA, parentB, pack) — sem parâmetro de método
  });
});
