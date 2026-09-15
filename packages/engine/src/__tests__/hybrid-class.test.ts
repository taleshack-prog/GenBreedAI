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

function p(id: string, sex: "M" | "F", species: string): ParentInput {
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

  it("`species` é OBRIGATÓRIO em ParentInput — TypeScript rejeita omissão (ADR-0015, correção pós-Etapa-2c)", () => {
    // O fallback antigo ("ausente ⇒ SAME_SPECIES") foi REMOVIDO — species
    // agora é exigido em tempo de compilação, não há mais "ausência" a
    // tratar em runtime. Prova negativa abaixo: o literal só compila com a
    // diretiva de supressão na linha imediatamente anterior a ele.
    // @ts-expect-error — 'species' faltando deve ser erro de tipo
    const semSpecies: ParentInput = { id: "x", genotype: { loci: {}, qtl: {} }, generation: 0, sex: "M" };
    expect(semSpecies.species).toBeUndefined(); // em runtime puro JS isso ainda "funciona"; o ponto é o erro de TIPO acima
  });

  it("pack canino: toda raça com species='canis-familiaris' → SAME_SPECIES entre quaisquer duas raças", () => {
    expect(hybridClass(p("a", "M", "canis-familiaris"), p("b", "F", "canis-familiaris"), CANINE_PACK)).toBe("SAME_SPECIES");
  });

  it("classe deriva do PAR de espécies, não do method — hybridClass não recebe method", () => {
    expect(hybridClass.length).toBe(3); // (parentA, parentB, pack) — sem parâmetro de método
  });
});
