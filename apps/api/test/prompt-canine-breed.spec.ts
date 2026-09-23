/**
 * Prompt de raça PURA canina (correção de "dogue-alemao × dogue-alemao saiu com cara de mastim"): o espécime NASCIDO tem id
 * gerado, então `dogBreedInfo(id)` não o achava e o prompt dizia só "mixed-breed dog" — sem nenhuma âncora de raça/proporção.
 * Agora a raça pura (species sem "×") é NOMEADA em inglês; cor, padrão e morfologia continuam do fenótipo calculado e
 * PREVALECEM sobre o padrão da raça; híbridos ficam como estavam.
 */
import { describe, it, expect } from "vitest";
import { DOG_BREEDS, DOG_BREED_ENGLISH_NAMES, dogBreedEnglishName } from "@genbreedai/shared";
import { founderSeeds, type StoredSpecimen } from "../src/specimens/in-memory.repository";
import { buildPrompt } from "../src/images/prompt";

const founder = (id: string): StoredSpecimen => founderSeeds().find((f) => f.id === id)!;

/** Espécime NASCIDO: mesmo genótipo do fundador, mas id gerado e método ≠ FOUNDER (como sai de um cruzamento). */
function born(baseId: string, over: { species?: string; loci?: Record<string, [string, string]> } = {}): StoredSpecimen {
  const f = founder(baseId);
  const genotype = structuredClone(f.genotype);
  for (const [k, v] of Object.entries(over.loci ?? {})) genotype.loci[k] = v;
  return { ...f, id: "spc_nascido_0001", ownerId: "jogador", method: "F1", generation: 1, genotype, species: over.species ?? f.species };
}

describe("raça pura canina nascida — o prompt NOMEIA a raça", () => {
  it("dogue-alemao puro: contém 'Great Dane' e 'purebred', e NÃO cai em 'mixed-breed'", () => {
    const p = buildPrompt(born("dogue-preto"));
    expect(p).toContain("a purebred Great Dane dog (Canis familiaris)");
    expect(p).not.toContain("mixed-breed");
  });

  it("os seis Dogues Alemães (species compartilhada 'dogue-alemao') saem todos como Great Dane", () => {
    for (const id of ["dogue-dourado", "dogue-tigrado", "dogue-preto", "dogue-azul", "dogue-arlequim", "dogue-manto"]) {
      expect(buildPrompt(born(id)), id).toContain("purebred Great Dane dog");
    }
  });

  it("outras raças usam o nome inglês do descritor (Boerboel, English Mastiff)", () => {
    expect(buildPrompt(born("boerboel"))).toContain("a purebred Boerboel dog (Canis familiaris)");
    expect(buildPrompt(born("mastim-ingles"))).toContain("a purebred English Mastiff dog (Canis familiaris)");
  });

  it("a proporção do QTL continua no texto (porte/vigor) e a morfologia calculada também", () => {
    const p = buildPrompt(born("dogue-preto"));
    expect(p).toMatch(/very large and massive|large/);
    expect(p).toMatch(/muzzle/);
  });
});

describe("a cor calculada PREVALECE sobre o padrão da raça", () => {
  it("Dogue Alemão merle azul (D d/d + M/m) sai merle azul, com a cláusula de prioridade ANTES da cor", () => {
    const p = buildPrompt(born("dogue-azul", { loci: { M: ["M", "m"] } }));
    expect(p).toContain("steel blue-grey (diluted black)");
    expect(p).toContain("merle dappled pattern");
    const clause = p.indexOf("these take priority over the Great Dane breed's typical colour and markings");
    expect(clause).toBeGreaterThan(-1);
    expect(p.indexOf("steel blue-grey")).toBeGreaterThan(clause);
  });

  it("um dogue de genótipo preto sólido NÃO ganha a cor de outro dogue (azul, tigrado) nem do padrão típico da raça", () => {
    const p = buildPrompt(born("dogue-preto"));
    expect(p).toContain("a solid black coat");
    expect(p).not.toContain("steel blue");
    expect(p).not.toContain("brindle");
    expect(p).not.toContain("merle");
  });

  it("dogue tigrado (K^br) sai tigrado pelo fenótipo — a cor vem do genótipo, não do nome", () => {
    expect(buildPrompt(born("dogue-tigrado"))).toContain("brindle");
  });
});

describe("híbridos e demais caminhos continuam como estavam", () => {
  it("híbrido canino NÃO leva nome de raça pura: sem 'purebred' nem 'Great Dane', mantém 'mixed-breed' e 'a cross between'", () => {
    const p = buildPrompt(born("dogue-preto", { species: "dogue-alemao×boerboel" }));
    expect(p).not.toContain("purebred");
    expect(p).not.toContain("Great Dane");
    expect(p).toContain("mixed-breed domestic dog (a cross between");
  });

  it("fundador (id de raça) segue pelo caminho antigo, com o descritor da raça", () => {
    const p = buildPrompt(founder("boerboel"));
    expect(p).toContain("a purebred Boerboel dog (Canis familiaris): an adult Boerboel mastiff");
  });

  it("raça sem nome inglês no descritor (terrier-anao-branco) cai no texto genérico de antes — sem inventar nome", () => {
    const p = buildPrompt(born("terrier-anao-branco"));
    expect(p).toContain("mixed-breed dog");
    expect(p).not.toContain("purebred");
  });

  it("dogBreedEnglishName: híbrido e espécie desconhecida → undefined", () => {
    expect(dogBreedEnglishName("dogue-alemao×boerboel")).toBeUndefined();
    expect(dogBreedEnglishName("raca-que-nao-existe")).toBeUndefined();
    expect(dogBreedEnglishName("dogue-alemao")).toBe("Great Dane");
  });
});

describe("tabela de nomes ingleses — nada inventado", () => {
  it("cada nome aparece LITERALMENTE no descritor da raça (para dogue-alemao, nos seis dogue-*)", () => {
    for (const [species, name] of Object.entries(DOG_BREED_ENGLISH_NAMES)) {
      expect(species.includes("×"), species).toBe(false);
      const ids = Object.keys(DOG_BREEDS).filter((id) => id === species || (species === "dogue-alemao" && id.startsWith("dogue-")));
      expect(ids.length, `nenhuma raça de DOG_BREEDS para a espécie ${species}`).toBeGreaterThan(0);
      for (const id of ids) expect(DOG_BREEDS[id]!.descriptor, `${species} → ${id}`).toContain(name);
    }
  });

  it("toda espécie canina de fundador tem nome inglês, exceto a documentada (terrier-anao-branco)", () => {
    const species = new Set(founderSeeds().filter((f) => f.pack === "canine").map((f) => f.species));
    const missing = [...species].filter((sp) => !DOG_BREED_ENGLISH_NAMES[sp]);
    expect(missing).toEqual(["terrier-anao-branco"]);
  });
});
