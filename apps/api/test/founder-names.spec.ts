/**
 * Nome de exibição dos GÊMEOS de fundador mosaico (ADR-0038): o gêmeo macho de uma tartaruga/calico herda o X não-laranja e sai PRETO (regra do
 * ADR-0035) — o nome não pode continuar "Persa Tartaruga ♂". Regra geral em `resolveDisplayName` (sem lista à mão): troca a palavra pela cor real e,
 * se o nome já é de outro fundador, acrescenta a linhagem. Nenhum nome de exibição se repete entre linhas de fundadores diferentes.
 */
import { describe, it, expect } from "vitest";
import { resolveDisplayName, mosaicMaleTwinColourName, baseFounderId, BREEDS } from "@genbreedai/shared";
import { founderSeeds, type StoredSpecimen } from "../src/specimens/in-memory.repository";
import { buildPrompt, traitVector } from "../src/images/prompt";

const all = founderSeeds();
const founder = (id: string): StoredSpecimen => all.find((f) => f.id === id)!;
const nameOf = (id: string) => resolveDisplayName(id, founder(id).species);

const MOSAIC_BASES = all
  .filter((f) => f.species === "felis-catus" && !/-(femea|macho)$/.test(f.id) && /\b(Tartaruga|Calico)\b/.test(BREEDS[f.id]?.name ?? ""))
  .map((f) => f.id);

describe("gêmeo macho de tartaruga/calico tem nome próprio", () => {
  it("os 4 casos: Persa Preto; Gato Preto e Maine Coon Preto com a linhagem (esses nomes já existem)", () => {
    expect(MOSAIC_BASES.sort()).toEqual(["gato-calico", "gato-maine-coon-tartaruga", "gato-persa-tartaruga", "gato-tartaruga"]);
    expect(nameOf("gato-persa-tartaruga-macho")).toBe("Persa Preto"); // sem colisão: não existe gato-persa-preto
    expect(nameOf("gato-tartaruga-macho")).toBe("Gato Preto (linhagem Tartaruga)"); // colide com o gato-preto
    expect(nameOf("gato-calico-macho")).toBe("Gato Preto (linhagem Calico)"); // idem, e distinto do da tartaruga
    expect(nameOf("gato-maine-coon-tartaruga-macho")).toBe("Maine Coon Preto (linhagem Tartaruga)"); // colide com o gato-maine-coon-preto
  });

  it("os nomes que colidiriam de fato colidiam: 'Gato Preto' e 'Maine Coon Preto' já são nomes de outros fundadores", () => {
    expect(BREEDS["gato-preto"]!.name).toBe("Gato Preto");
    expect(BREEDS["gato-maine-coon-preto"]!.name).toBe("Maine Coon Preto");
    expect(Object.values(BREEDS).some((b) => b.name === "Persa Preto")).toBe(false);
  });

  it("o base (fêmea) mantém o nome de sempre; nenhuma palavra Tartaruga/Calico sobra no nome do gêmeo macho", () => {
    for (const id of MOSAIC_BASES) {
      expect(nameOf(id)).toBe(BREEDS[id]!.name);
      const twin = nameOf(`${id}-macho`);
      // a palavra só pode aparecer dentro de "(linhagem …)", que identifica a linhagem, nunca como a cor do gato
      expect(twin.replace(/\s*\(linhagem [^)]*\)/, ""), id).not.toMatch(/Tartaruga|Calico/);
      expect(twin).toContain("Preto");
    }
  });

  it("REGRA GERAL, não lista: todo gêmeo macho de fundador mosaico de FATO sai preto (melanismo), então 'Preto' é a cor que ele tem", () => {
    for (const id of MOSAIC_BASES) {
      const twin = founder(`${id}-macho`);
      expect(twin.sex, id).toBe("M");
      expect(traitVector(twin)[0], `${twin.id} deveria ser preto`).toContain("a melanistic solid black coat");
    }
  });

  it("outros gêmeos NÃO mudam de nome: laranja (fêmea O/O), gêmeos de raças e de cães/selvagens", () => {
    for (const id of ["gato-laranja-femea", "gato-persa-laranja-femea", "gato-persa-macho", "gato-tabby-femea", "boerboel-femea", "onca-negra-macho"]) {
      expect(mosaicMaleTwinColourName(id), id).toBeNull();
      expect(resolveDisplayName(id, founder(id).species), id).toBe(resolveDisplayName(baseFounderId(id), founder(id).species));
    }
  });

  it("ids que não são gêmeos de mosaico → null; o filhote nascido (id gerado) nunca é afetado", () => {
    expect(mosaicMaleTwinColourName("gato-persa-tartaruga")).toBeNull(); // o base (fêmea)
    expect(mosaicMaleTwinColourName("spc_abc123")).toBeNull();
    expect(resolveDisplayName("spc_abc123", "felis-catus")).toBe("Gato doméstico");
  });
});

describe("nenhum nome de exibição fica duplicado entre fundadores diferentes", () => {
  it("cada nome pertence a UMA linha de fundador (base + gêmeo contam como a mesma linha)", () => {
    const linesByName = new Map<string, Set<string>>();
    for (const f of all) {
      const name = resolveDisplayName(f.id, f.species);
      const set = linesByName.get(name) ?? new Set<string>();
      set.add(baseFounderId(f.id));
      linesByName.set(name, set);
    }
    const dupes = [...linesByName].filter(([, lines]) => lines.size > 1).map(([n, l]) => `${n}: ${[...l].join(", ")}`);
    expect(dupes).toEqual([]);
    expect(linesByName.size).toBeGreaterThanOrEqual(90); // 90 linhas + 4 nomes próprios dos gêmeos mosaico
  });
});

describe("o prompt do gêmeo preto não chama o gato de tartaruga", () => {
  it("fundador base mantém 'Tartaruga'; o gêmeo macho usa a cor que tem (sem a palavra Tartaruga/Calico)", () => {
    expect(buildPrompt(founder("gato-persa-tartaruga"))).toContain("a purebred Persa Tartaruga cat (Felis catus)");
    const twin = buildPrompt(founder("gato-persa-tartaruga-macho"));
    expect(twin).toContain("a purebred Persa Preto cat (Felis catus)");
    expect(twin).not.toMatch(/Tartaruga|Calico/);
    expect(twin).toContain("a melanistic solid black coat");
    for (const id of ["gato-tartaruga-macho", "gato-calico-macho", "gato-maine-coon-tartaruga-macho"]) {
      expect(buildPrompt(founder(id)), id).not.toMatch(/Tartaruga|Calico/);
    }
    expect(buildPrompt(founder("gato-tartaruga-macho"))).toContain("a purebred Gato Preto cat"); // sem a "(linhagem …)": o prompt só leva a cor
  });
});
