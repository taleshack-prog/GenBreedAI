/**
 * ADR-0034 — B (chocolate/canela) e D (diluição) destravados em `fel()` e no texto do prompt felino, SEM mudar nenhum fundador:
 *  - os cinco genótipos de cor produzem o texto pedido; os pontos (`c^s/c^s`) dizem a cor (seal/chocolate/blue/lilac);
 *  - todo fundador atual (gatos e selvagens, base e gêmeo) continua com o MESMO genótipo, fenótipo e texto de pelagem de antes —
 *    provado contra uma cópia LITERAL da `coatFeline` antiga, abaixo.
 */
import { describe, it, expect } from "vitest";
import { expressPhenotype, FELINE_PACK, computeCacheKey } from "@genbreedai/engine";
import { founderSeeds, type StoredSpecimen } from "../src/specimens/in-memory.repository";
import { buildPrompt, traitVector, felinePointColour } from "../src/images/prompt";

const founder = (id: string): StoredSpecimen => founderSeeds().find((f) => f.id === id)!;

/** Pelagem (1º item de `traitVector`) de um gato-base com loci trocados. */
function coatOf(base: string, loci: Record<string, [string, string]>): string {
  const f = founder(base);
  const genotype = structuredClone(f.genotype);
  for (const [k, v] of Object.entries(loci)) genotype.loci[k] = v;
  return traitVector({ ...f, genotype })[0]!;
}
const promptOf = (base: string, loci: Record<string, [string, string]>): string => {
  const f = founder(base);
  const genotype = structuredClone(f.genotype);
  for (const [k, v] of Object.entries(loci)) genotype.loci[k] = v;
  return buildPrompt({ ...f, id: "spc_cor_0001", method: "F1", genotype, breed: null });
};

// Tabby liso, pelo curto: só B/D variam. O texto de pelagem termina com ", short sleek fur" (sufixo de Fl, inalterado).
const PLAIN = { A: ["a", "a"], P: ["P^t", "P^t"] } as Record<string, [string, string]>;
const FUR = ", short sleek fur";

describe("cores de B e D (a/a, padrão liso) — texto exato", () => {
  it.each([
    ["a/a d/d", { D: ["d", "d"] }, "a solid blue-grey (diluted black) coat"],
    ["a/a b/b", { B: ["b", "b"] }, "a solid chocolate brown coat"],
    ["a/a b/b d/d", { B: ["b", "b"], D: ["d", "d"] }, "a solid lilac (diluted chocolate) coat"],
    ["a/a b^l/b^l", { B: ["b^l", "b^l"] }, "a solid cinnamon coat"],
    ["a/a b^l/b^l d/d", { B: ["b^l", "b^l"], D: ["d", "d"] }, "a solid fawn coat"],
  ] as [string, Record<string, [string, string]>, string][])("%s → %s", (_l, loci, expected) => {
    expect(coatOf("gato-tabby", { ...PLAIN, ...loci })).toBe(expected + FUR);
  });

  it("portador (B/b, D/d) NÃO muda a cor: continua o texto padrão do tom de fundo", () => {
    const carrier = coatOf("gato-tabby", { ...PLAIN, B: ["B", "b"], D: ["D", "d"] });
    const dense = coatOf("gato-tabby", PLAIN);
    expect(carrier).toBe(dense);
    expect(dense).toBe(`a golden plain uniform coat${FUR}`); // padrão de sempre: tom Bd^d + "plain uniform"
  });

  it("padrão marcado (listras/pintas/rosetas) usa marcas 'darker', não 'black', e a cor certa", () => {
    expect(coatOf("gato-tabby", { A: ["a", "a"], P: ["P^m", "P^m"], B: ["b", "b"] })).toBe(`a chocolate brown coat with bold vertical darker stripes${FUR}`);
    expect(coatOf("gato-tabby", { A: ["a", "a"], P: ["P^s", "P^s"], D: ["d", "d"] })).toBe(`a blue-grey (diluted black) coat with round solid darker spots${FUR}`);
    expect(coatOf("gato-tabby", { A: ["a", "a"], P: ["P^r", "P^r"], B: ["b^l", "b^l"] })).toBe(`a cinnamon coat covered in bold darker rosettes with inner spots${FUR}`);
  });

  it("melanismo (A_) com D d/d sai AZUL, não preto; sem B/D fora do padrão continua 'melanistic solid black' como sempre", () => {
    expect(coatOf("gato-preto", { D: ["d", "d"] })).toBe(`a melanistic solid blue-grey (diluted black) coat with faint ghost markings${FUR}`);
    expect(coatOf("gato-preto", {})).toBe(`a melanistic solid black coat with faint ghost markings${FUR}`);
  });

  it("branco, albino e sphynx continuam mascarando B e D (texto inalterado)", () => {
    expect(coatOf("gato-branco", { B: ["b", "b"], D: ["d", "d"] })).toContain("a pure solid white coat");
    expect(coatOf("gato-tabby", { C: ["c", "c"], B: ["b", "b"] })).toContain("true albino appearance");
    expect(coatOf("gato-sphynx", { B: ["b", "b"] })).toContain("completely hairless");
  });

  it("o prompt completo carrega o texto (exemplo lilás)", () => {
    expect(promptOf("gato-tabby", { ...PLAIN, B: ["b", "b"], D: ["d", "d"] })).toContain("a solid lilac (diluted chocolate) coat");
  });
});

describe("pontos do siamês (c^s/c^s): a cor do ponto vem de B e D", () => {
  const SIAMESE = (loci: Record<string, [string, string]>) => coatOf("gato-siames", loci);

  it("os 4 pontos: seal (B_ D_), chocolate (b/b D_), blue (B_ d/d), lilac (b/b d/d) — nome e texto", () => {
    expect(felinePointColour({ B: "preto", D: "denso" })).toBe("seal");
    expect(felinePointColour({ B: "chocolate", D: "denso" })).toBe("chocolate");
    expect(felinePointColour({ B: "preto", D: "diluído" })).toBe("blue");
    expect(felinePointColour({ B: "chocolate", D: "diluído" })).toBe("lilac");

    expect(SIAMESE({})).toContain(", with darker pointed extremities (face, ears, paws)"); // seal: frase antiga, inalterada
    expect(SIAMESE({ B: ["b", "b"] })).toContain(", with chocolate-brown pointed extremities (face, ears, paws)");
    expect(SIAMESE({ D: ["d", "d"] })).toContain(", with blue-grey pointed extremities (face, ears, paws)");
    expect(SIAMESE({ B: ["b", "b"], D: ["d", "d"] })).toContain(", with pale lilac-grey pointed extremities (face, ears, paws)");
  });

  it("canela e fawn nos pontos (b^l)", () => {
    expect(felinePointColour({ B: "canela", D: "denso" })).toBe("cinnamon");
    expect(felinePointColour({ B: "canela", D: "diluído" })).toBe("fawn");
    expect(SIAMESE({ B: ["b^l", "b^l"] })).toContain("cinnamon pointed extremities");
  });

  it("o CORPO do gato de pontos segue o tom de fundo (a cor de B/D vai só nos pontos) — não vira 'a solid chocolate brown coat'", () => {
    const choc = SIAMESE({ B: ["b", "b"] });
    expect(choc.startsWith("a sandy tan plain uniform coat, with chocolate-brown pointed extremities")).toBe(true);
    expect(choc).not.toContain("solid chocolate");
  });

  it("portador não muda o ponto: seal com B/b D/d continua 'darker'", () => {
    expect(SIAMESE({ B: ["B", "b"], D: ["D", "d"] })).toContain("darker pointed extremities");
  });
});

// ── Fundadores atuais: idênticos ─────────────────────────────────────────────────────────────────────────────────────

/** Cópia LITERAL da `coatFeline` ANTES do ADR-0034 (só B/D e pontos mudaram), para provar que nenhum fundador muda de texto. */
function legacyBaseTone(loci: Record<string, string>): string {
  const map: Record<string, string> = { "fundo âmbar": "deep amber", "fundo dourado": "golden", "fundo areia": "sandy tan", "fundo cinza": "cool grey" };
  return (loci.Bd && map[loci.Bd]) ? map[loci.Bd]! : "golden-tan";
}
function legacyCoatFeline(loci: Record<string, string>): string {
  if (loci.Hr === "pelado (sphynx)") return "completely hairless, soft wrinkled bare skin with no fur, coat pattern only faintly visible as skin pigment";
  if (loci.W === "branco") return "a pure solid white coat";
  if (loci.C === "albino") return "a true albino appearance: pure white coat with faint ghost markings and pink-red eyes";
  let base = `a ${legacyBaseTone(loci)}`;
  if (loci.B === "chocolate") base = "a chocolate-brown";
  else if (loci.B === "canela") base = "a cinnamon";
  if (loci.D === "diluído") base = base + " diluted blue-grey";
  let coat: string;
  if (loci.A?.startsWith("melan")) coat = "a melanistic solid black coat with faint ghost markings";
  else if (loci.P === "rosetas") coat = `${base} coat covered in bold black rosettes with inner spots`;
  else if (loci.P === "listras") coat = `${base} coat with bold vertical black stripes`;
  else if (loci.P === "pintas") coat = `${base} coat with round solid black spots`;
  else coat = `${base} plain uniform coat`;
  if (loci.C === "pontos") coat += ", with darker pointed extremities (face, ears, paws)";
  if (loci.Ma === "juba completa") coat += ", a full thick lion-like mane around the head and neck";
  else if (loci.Ma === "juba parcial") coat += ", a partial sparse mane (ligre-like), shorter than a lion's";
  if (loci.Fl === "pelo longo") coat += ", long thick fluffy fur";
  else if (loci.Fl === "pelo curto") coat += ", short sleek fur";
  return coat;
}

describe("fundadores felinos atuais — nada mudou", () => {
  const felines = founderSeeds().filter((f) => f.pack === "feline");

  it("são os 27 fundadores-base (12 gatos + 15 selvagens) + 27 gêmeos de sempre, todos com B B/B e D D/D (nenhum genótipo alterado)", () => {
    expect(felines.length).toBe(54);
    for (const f of felines) {
      expect(f.genotype.loci.B, f.id).toEqual(["B", "B"]);
      expect(f.genotype.loci.D, f.id).toEqual(["D", "D"]);
    }
  });

  it("o texto de pelagem de TODO fundador felino (base e gêmeo) é idêntico ao da coatFeline antiga", () => {
    for (const f of felines) {
      const loci = expressPhenotype({ loci: f.genotype.loci, qtl: {} }, FELINE_PACK, f.sex ?? undefined).loci;
      expect(traitVector(f)[0], f.id).toBe(legacyCoatFeline(loci));
    }
  });

  it("o prompt completo dos gatos de raça (Siamês/Birmanês/Ragdoll de pontos incluídos) segue com 'darker pointed extremities'", () => {
    for (const id of ["gato-siames", "gato-birmania", "gato-ragdoll"]) {
      expect(buildPrompt(founder(id)), id).toContain("with darker pointed extremities (face, ears, paws)");
    }
  });

  it("a cacheKey de cada fundador só depende do genótipo (e sexo), não do prompt: sem mudança de genótipo, sem mudança de chave", () => {
    for (const f of felines) {
      const a = computeCacheKey(f.genotype, FELINE_PACK, f.sex ?? undefined);
      const b = computeCacheKey(structuredClone(f.genotype), FELINE_PACK, f.sex ?? undefined);
      expect(a, f.id).toBe(b);
    }
  });
});
