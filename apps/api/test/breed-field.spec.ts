/**
 * Campo `breed` do espécime (ADR-0033 adendo 2): gatos de raça nascidos mantêm a raça no prompt. Cobre a tabela de nomes ingleses,
 * o preenchimento (fundador, gêmeo, cão, nascimento por cruzamento), a herança (mesma raça dos dois pais; senão nulo) e o prompt
 * (raça nomeada, cor/padrão calculados prevalecendo; mestiço, variedade de cor e espécime antigo como antes).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { BREEDS, CAT_BREED_ENGLISH_NAMES, catBreedEnglishName } from "@genbreedai/shared";
import { InMemorySpecimenRepository, FOUNDER_SEX, founderSeeds, type StoredSpecimen } from "../src/specimens/in-memory.repository";
import { founderBreed, inheritBreed, specimenBreed, breedForOffspring } from "../src/specimens/breed";
import { CrossService } from "../src/cross/cross.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { buildPrompt } from "../src/images/prompt";

const founder = (id: string): StoredSpecimen => founderSeeds().find((f) => f.id === id)!;
const maleOf = (base: string) => (FOUNDER_SEX[base] === "M" ? base : `${base}-macho`);
const femaleOf = (base: string) => (FOUNDER_SEX[base] === "F" ? base : `${base}-femea`);

function born(baseId: string, over: { loci?: Record<string, [string, string]>; breed?: string | null } = {}): StoredSpecimen {
  const f = founder(baseId);
  const genotype = structuredClone(f.genotype);
  for (const [k, v] of Object.entries(over.loci ?? {})) genotype.loci[k] = v;
  return { ...f, id: "spc_nascido_0002", ownerId: "jogador", method: "F1", generation: 1, genotype, breed: over.breed ?? null };
}

describe("tabela de nomes ingleses dos gatos — nada inventado", () => {
  it("são as 9 raças pedidas, cada nome aparece no descritor da raça ('<Nome> cat'), e tabby/preto/branco NÃO estão", () => {
    expect(CAT_BREED_ENGLISH_NAMES).toEqual({
      "gato-siames": "Siamese", "gato-maine-coon": "Maine Coon", "gato-persa": "Persian", "gato-bengala": "Bengal",
      "gato-birmania": "Birman", "gato-sphynx": "Sphynx", "gato-mau-egipcio": "Egyptian Mau", "gato-abissinio": "Abyssinian", "gato-ragdoll": "Ragdoll",
    });
    for (const [id, name] of Object.entries(CAT_BREED_ENGLISH_NAMES)) expect(BREEDS[id]!.descriptor, id).toContain(`${name} cat`);
    for (const colour of ["gato-tabby", "gato-preto", "gato-branco"]) {
      expect(CAT_BREED_ENGLISH_NAMES[colour], colour).toBeUndefined();
      expect(BREEDS[colour]!.descriptor).toContain("domestic shorthair");
    }
    expect(catBreedEnglishName(null)).toBeUndefined();
    expect(catBreedEnglishName("gato-persa")).toBe("Persian");
  });
});

describe("preenchimento nos fundadores", () => {
  it("gato de raça → o id da raça; o gêmeo herda o mesmo; variedades de cor e selvagens → nulo", () => {
    expect(founder("gato-persa").breed).toBe("gato-persa");
    const twinId = FOUNDER_SEX["gato-persa"] === "M" ? "gato-persa-femea" : "gato-persa-macho";
    expect(founder(twinId).breed).toBe("gato-persa");
    for (const id of ["gato-tabby", "gato-preto", "gato-branco", "onca-negra", "leao", "tigre-bengala"]) expect(founder(id).breed, id).toBeNull();
  });

  it("todo fundador (base e gêmeo) de raça de gato tem breed = id base; de cão, breed = a espécie", () => {
    for (const f of founderSeeds()) {
      if (f.species === "felis-catus") {
        const base = f.id.replace(/-(femea|macho)$/, "");
        expect(f.breed, f.id).toBe(CAT_BREED_ENGLISH_NAMES[base] ? base : null);
      } else if (f.pack === "canine") {
        expect(f.breed, f.id).toBe(f.species);
      } else {
        expect(f.breed, f.id).toBeNull();
      }
    }
  });

  it("founderBreed: twins tratados como o base; espécie/ids desconhecidos → nulo", () => {
    expect(founderBreed("gato-persa-femea", "felis-catus")).toBe("gato-persa");
    expect(founderBreed("dogue-azul-macho", "dogue-alemao")).toBe("dogue-alemao");
    expect(founderBreed("onca-negra", "panthera-onca")).toBeNull();
    expect(founderBreed("qualquer-id", "felis-catus")).toBeNull();
  });
});

describe("herança (inheritBreed / specimenBreed)", () => {
  it("mesma raça nos dois → herda; diferentes ou algum nulo → nulo (mestiço)", () => {
    expect(inheritBreed("gato-persa", "gato-persa")).toBe("gato-persa");
    expect(inheritBreed("gato-persa", "gato-siames")).toBeNull();
    expect(inheritBreed("gato-persa", null)).toBeNull();
    expect(inheritBreed(null, null)).toBeNull();
    expect(inheritBreed(undefined, "gato-persa")).toBeNull();
  });

  it("fundador legado (breed nulo na base) deriva a raça do id; nascido com breed nulo continua nulo", () => {
    const legacyFounder = { ...founder("gato-persa"), breed: null };
    expect(specimenBreed(legacyFounder)).toBe("gato-persa");
    expect(specimenBreed({ ...legacyFounder, id: "gato-persa-macho" })).toBe("gato-persa");
    expect(specimenBreed(born("gato-persa"))).toBeNull();
    expect(specimenBreed(born("gato-persa", { breed: "gato-persa" }))).toBe("gato-persa");
  });

  it("breedForOffspring lê os pais no repositório (pai ou mãe ausente → nulo)", async () => {
    const repo = new InMemorySpecimenRepository();
    expect(await breedForOffspring(repo, maleOf("gato-persa"), femaleOf("gato-persa"))).toBe("gato-persa");
    expect(await breedForOffspring(repo, maleOf("gato-persa"), femaleOf("gato-siames"))).toBeNull();
    expect(await breedForOffspring(repo, maleOf("gato-persa"), "nao-existe")).toBeNull();
  });
});

describe("CrossService.execute grava a raça do filhote", () => {
  let repo: InMemorySpecimenRepository;
  let svc: CrossService;
  beforeEach(() => { repo = new InMemorySpecimenRepository(); svc = new CrossService(repo, new WalletService(new InMemoryWalletRepository())); });

  it("Persa × Persa → 'gato-persa'; Persa × Siamês → nulo (mestiço); tabby × preto → nulo (variedades de cor)", async () => {
    const same = await svc.execute("demo", "FREE", { sireId: maleOf("gato-persa"), damId: femaleOf("gato-persa"), method: "F1" });
    expect(same.specimen.breed).toBe("gato-persa");
    const mixed = await svc.execute("demo", "FREE", { sireId: maleOf("gato-persa"), damId: femaleOf("gato-siames"), method: "F1" });
    expect(mixed.specimen.breed).toBeNull();
    const colours = await svc.execute("demo", "FREE", { sireId: maleOf("gato-tabby"), damId: femaleOf("gato-preto"), method: "F1" });
    expect(colours.specimen.breed).toBeNull();
  });

  it("fundadores ANTIGOS (breed nulo na base) ainda geram filhote de raça — o valor se deriva do id do fundador", async () => {
    for (const id of [maleOf("gato-persa"), femaleOf("gato-persa")]) await repo.save({ ...(await repo.get(id))!, breed: null });
    const r = await svc.execute("demo", "FREE", { sireId: maleOf("gato-persa"), damId: femaleOf("gato-persa"), method: "F1" });
    expect(r.specimen.breed).toBe("gato-persa");
  });

  it("neto de dois Persas (pais nascidos com breed) mantém a raça; se um dos pais é antigo (nascido sem breed), fica nulo", async () => {
    // Seeds diferentes até sair um macho e uma fêmea (o sexo do filhote vem do sorteio semeado; a seed padrão seria a mesma sempre).
    let m: StoredSpecimen | undefined;
    let f: StoredSpecimen | undefined;
    for (let i = 0; i < 40 && !(m && f); i++) {
      const c = (await svc.execute("demo", "FREE", { sireId: maleOf("gato-persa"), damId: femaleOf("gato-persa"), method: "F1", seed: `neto-${i}` })).specimen;
      expect(c.breed).toBe("gato-persa");
      if (c.sex === "M") m ??= c; else f ??= c;
    }
    expect(m && f, "não saiu um macho e uma fêmea em 40 seeds").toBeTruthy();
    const g = await svc.execute("demo", "FREE", { sireId: m!.id, damId: f!.id, method: "F1" });
    expect(g.specimen.breed).toBe("gato-persa");
    await repo.save({ ...m!, breed: null }); // "antigo": nascido antes da coluna
    const g2 = await svc.execute("demo", "FREE", { sireId: m!.id, damId: f!.id, method: "F1" });
    expect(g2.specimen.breed).toBeNull();
  });

  it("cães: dois Dogues (cores diferentes, mesma espécie) → 'dogue-alemao'; Boerboel × Rottweiler → nulo", async () => {
    const dogues = await svc.execute("demo", "SENIOR", { sireId: maleOf("dogue-azul"), damId: femaleOf("dogue-preto"), method: "F1" });
    expect(dogues.specimen.breed).toBe("dogue-alemao");
    const mix = await svc.execute("demo", "SENIOR", { sireId: maleOf("boerboel"), damId: femaleOf("rottweiler"), method: "F1" });
    expect(mix.specimen.breed).toBeNull();
  });
});

describe("prompt do gato de raça nascido", () => {
  it("as 9 raças: o filhote com breed contém o nome inglês e 'purebred', e NÃO o texto genérico", () => {
    for (const [id, name] of Object.entries(CAT_BREED_ENGLISH_NAMES)) {
      const p = buildPrompt(born(id, { breed: id }));
      expect(p, id).toContain(`a purebred ${name} cat (Felis catus)`);
      expect(p, id).not.toContain("domestic house cat");
    }
  });

  it("filhote de dois Persas contém 'Persian'; Persa × Siamês (breed nulo) não contém nome de raça", () => {
    expect(buildPrompt(born("gato-persa", { breed: "gato-persa" }))).toContain("Persian");
    const mixed = buildPrompt(born("gato-persa", { breed: inheritBreed("gato-persa", "gato-siames") }));
    expect(mixed).not.toContain("purebred");
    expect(mixed).not.toContain("a Persian cat");
    expect(mixed).not.toContain("Siamese");
  });

  it("a cor e o padrão calculados PREVALECEM: cláusula de prioridade antes da cor; Persa branco sai branco; Siamês sem 'pointed' não ganha os pontos da raça", () => {
    const white = buildPrompt(born("gato-persa", { breed: "gato-persa", loci: { W: ["W", "w"] } }));
    const clause = white.indexOf("these take priority over the Persian breed's typical colour and markings");
    expect(clause).toBeGreaterThan(-1);
    expect(white.indexOf("a pure solid white coat")).toBeGreaterThan(clause);

    const notPointed = buildPrompt(born("gato-siames", { breed: "gato-siames", loci: { C: ["C", "C"] } }));
    expect(notPointed).toContain("a purebred Siamese cat");
    expect(notPointed).not.toContain("pointed"); // nenhum descritor da raça entra; a cor vem do genótipo
    const pointed = buildPrompt(born("gato-siames", { breed: "gato-siames", loci: { C: ["c^s", "c^s"] } }));
    expect(pointed).toContain("darker pointed extremities");
  });

  it("variedades de cor nascidas (tabby/preto/branco, breed nulo) continuam gato doméstico; felino selvagem intacto", () => {
    for (const id of ["gato-tabby", "gato-preto", "gato-branco"]) {
      const p = buildPrompt(born(id));
      expect(p, id).toContain("domestic house cat");
      expect(p, id).not.toContain("purebred");
    }
    const lion = buildPrompt(founder("leao"));
    expect(lion).not.toContain("purebred");
  });

  it("fundador e gêmeo mantêm o comportamento atual (caminho pelo id, com o descritor da raça)", () => {
    const base = founder("gato-persa");
    const twin = { ...base, id: "gato-persa-macho" };
    expect(buildPrompt(base)).toContain("a purebred Persa cat (Felis catus): a Persian cat:");
    expect(buildPrompt(twin)).toBe(buildPrompt(base));
    // o campo breed do fundador não muda o texto do fundador
    expect(buildPrompt({ ...base, breed: null })).toBe(buildPrompt(base));
  });
});
