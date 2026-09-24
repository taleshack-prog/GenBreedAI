/**
 * ADR-0036 — 16 fundadores de COR (gato doméstico laranja/tartaruga/calico; Persa; Maine Coon; Abissínio; Ragdoll; Bengala). Só a cor muda em
 * relação ao fundador da raça. Este arquivo cobre: genótipo locus a locus, X do gêmeo, texto de pelagem, segregação, cacheKeys distintas e — em
 * número grande de filhotes — a herança ligada ao sexo do casal tartaruga × laranja.
 */
import { describe, it, expect } from "vitest";
import { BREEDS, CAT_FOUNDER_COLOUR_VARIANTS, baseFounderId, type Genotype } from "@genbreedai/shared";
import { cross, isMutant, computeCacheKey, FELINE_PACK, type ParentInput, type CrossContext } from "@genbreedai/engine";
import { founderSeeds, FOUNDER_SEX, type StoredSpecimen } from "../src/specimens/in-memory.repository";
import { traitVector } from "../src/images/prompt";

const all = founderSeeds();
const founder = (id: string): StoredSpecimen => all.find((f) => f.id === id)!;
const twinIdOf = (base: string) => (FOUNDER_SEX[base] === "M" ? `${base}-femea` : `${base}-macho`);
const maleOf = (base: string) => (FOUNDER_SEX[base] === "M" ? base : `${base}-macho`);
const femaleOf = (base: string) => (FOUNDER_SEX[base] === "F" ? base : `${base}-femea`);
const coatOf = (id: string) => traitVector(founder(id))[0]!;

type Pair = [string, string];
/** Cor de cada fundador novo: A, P, B, C, D, W, S + xLoci, exatamente como em founderSeeds (ordem dos alelos incluída). */
const COLOUR: Record<string, { A: Pair; P: Pair; B: Pair; C: Pair; D: Pair; W: Pair; S: Pair; x?: Genotype["xLoci"] }> = {
  "gato-laranja": { A: ["a", "a"], P: ["P^m", "P^m"], B: ["B", "B"], C: ["C", "C"], D: ["D", "d"], W: ["w", "w"], S: ["s", "s"], x: { O: ["O"] } },
  "gato-tartaruga": { A: ["A", "a"], P: ["P^m", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "d"], W: ["w", "w"], S: ["s", "s"], x: { O: ["O", "o"] } },
  "gato-calico": { A: ["A", "a"], P: ["P^m", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "d"], W: ["w", "w"], S: ["S", "s"], x: { O: ["O", "o"] } },
  "gato-persa-branco": { A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "D"], W: ["W", "w"], S: ["s", "s"] },
  "gato-persa-colorpoint": { A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "b"], C: ["c^s", "c^s"], D: ["D", "d"], W: ["w", "w"], S: ["s", "s"] },
  "gato-persa-chocolate": { A: ["a", "a"], P: ["P^t", "P^t"], B: ["b", "b"], C: ["C", "C"], D: ["D", "d"], W: ["w", "w"], S: ["s", "s"] },
  "gato-persa-laranja": { A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "d"], W: ["w", "w"], S: ["s", "s"], x: { O: ["O"] } },
  "gato-persa-tartaruga": { A: ["A", "a"], P: ["P^t", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "d"], W: ["w", "w"], S: ["s", "s"], x: { O: ["O", "o"] } },
  "gato-maine-coon-preto": { A: ["A", "a"], P: ["P^m", "P^m"], B: ["B", "B"], C: ["C", "C"], D: ["D", "D"], W: ["w", "w"], S: ["s", "s"] },
  "gato-maine-coon-branco": { A: ["a", "a"], P: ["P^m", "P^m"], B: ["B", "B"], C: ["C", "C"], D: ["D", "D"], W: ["W", "w"], S: ["s", "s"] },
  "gato-maine-coon-laranja": { A: ["a", "a"], P: ["P^m", "P^m"], B: ["B", "B"], C: ["C", "C"], D: ["D", "d"], W: ["w", "w"], S: ["s", "s"], x: { O: ["O"] } },
  "gato-maine-coon-tartaruga": { A: ["A", "a"], P: ["P^m", "P^m"], B: ["B", "B"], C: ["C", "C"], D: ["D", "d"], W: ["w", "w"], S: ["s", "s"], x: { O: ["O", "o"] } },
  "gato-abissinio-sorrel": { A: ["a", "a"], P: ["P^t", "P^t"], B: ["b^l", "b^l"], C: ["C", "C"], D: ["D", "d"], W: ["w", "w"], S: ["s", "s"] },
  "gato-abissinio-azul": { A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "b^l"], C: ["C", "C"], D: ["d", "d"], W: ["w", "w"], S: ["s", "s"] },
  "gato-ragdoll-blue": { A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "b"], C: ["c^s", "c^s"], D: ["d", "d"], W: ["w", "w"], S: ["S", "s"] },
  "gato-bengala-snow": { A: ["a", "a"], P: ["P^s", "P^t"], B: ["B", "B"], C: ["c^s", "c^s"], D: ["D", "D"], W: ["w", "w"], S: ["s", "s"] },
};
const NEW_IDS = Object.keys(COLOUR);
/** Fundador de que cada novo herda a morfologia (o doméstico usa o gato-tabby). */
const TEMPLATE: Record<string, string> = Object.fromEntries(NEW_IDS.map((id) => [id,
  id.startsWith("gato-persa") ? "gato-persa" : id.startsWith("gato-maine-coon") ? "gato-maine-coon" : id.startsWith("gato-abissinio") ? "gato-abissinio"
    : id.startsWith("gato-ragdoll") ? "gato-ragdoll" : id.startsWith("gato-bengala") ? "gato-bengala" : "gato-tabby"]));

describe("registro dos 16 fundadores de cor", () => {
  it("são exatamente 16 bases (o Persa Preto NÃO existe), todas com sexo em FOUNDER_SEX, BREEDS e tabela variante → raça", () => {
    expect(NEW_IDS.length).toBe(16);
    expect(all.find((f) => f.id.startsWith("gato-persa-preto"))).toBeUndefined();
    expect(Object.keys(CAT_FOUNDER_COLOUR_VARIANTS).sort()).toEqual([...NEW_IDS].sort());
    for (const id of NEW_IDS) {
      expect(FOUNDER_SEX[id], `sexo de ${id}`).toBeDefined();
      expect(BREEDS[id], `BREEDS ${id}`).toBeDefined();
      expect(founder(id), id).toBeDefined();
      expect(founder(twinIdOf(id)), `gêmeo de ${id}`).toBeDefined();
      expect(founder(twinIdOf(id)).sex).not.toBe(founder(id).sex);
    }
    expect(all.length).toBe(180); // 74 + 16 bases, cada uma com gêmeo
  });

  it("sexo do base: tartaruga e calico SEMPRE fêmea (só fêmea é mosaico); laranja macho", () => {
    for (const id of NEW_IDS) {
      if (/tartaruga|calico/.test(id)) expect(FOUNDER_SEX[id], id).toBe("F");
      if (/laranja/.test(id)) expect(FOUNDER_SEX[id], id).toBe("M");
    }
  });

  it("descritores de BREEDS SEM cor (a cor vem do fenótipo): nenhuma palavra de cor de pelagem (Ragdoll: idêntico ao da raça)", () => {
    const colour = /\b(black|white|ginger|orange|chocolate|cream|brown|golden|gold|silver|tortoiseshell|calico|cinnamon|fawn|lilac|ruddy|tabby|red)\b/i;
    for (const id of NEW_IDS) {
      const d = BREEDS[id]!.descriptor;
      if (id === "gato-ragdoll-blue") expect(d).toBe(BREEDS["gato-ragdoll"]!.descriptor);
      else expect(d, id).not.toMatch(colour);
    }
  });
});

describe("genótipo locus a locus", () => {
  it.each(NEW_IDS)("%s: cor exatamente como proposta; morfologia, portadores de forma e QTL iguais aos do fundador da raça", (id) => {
    const f = founder(id), tpl = founder(TEMPLATE[id]!), c = COLOUR[id]!;
    for (const k of ["A", "P", "B", "C", "D", "W", "S"] as const) expect(f.genotype.loci[k], `${id} ${k}`).toEqual(c[k]);
    for (const k of ["Ma", "He", "Ec", "Fl", "Hr"]) expect(f.genotype.loci[k], `${id} ${k}`).toEqual(tpl.genotype.loci[k]);
    if (id !== "gato-bengala-snow") expect(f.genotype.loci.Bd, `${id} Bd`).toEqual(tpl.genotype.loci.Bd);
    else expect(f.genotype.loci.Bd).toEqual(["Bd^s", "Bd^s"]);
    expect(f.genotype.qtl, `${id} qtl`).toEqual(tpl.genotype.qtl);
    if (c.x) expect(f.genotype.xLoci, `${id} X`).toEqual(c.x);
    else expect(f.genotype.xLoci, `${id} sem X`).toBeUndefined();
  });

  it("Fl do Persa e do Maine Coon segue l/s, como nos fundadores atuais (só a cor muda)", () => {
    for (const id of NEW_IDS.filter((x) => /persa|maine-coon/.test(x))) expect(founder(id).genotype.loci.Fl, id).toEqual(["Fl^l", "Fl^s"]);
  });

  it("gêmeo: X segundo a regra (fêmea O/O → macho [O]; O/o → macho [o]; macho [O] → fêmea [O,O]); autossomos idênticos ao base", () => {
    for (const id of NEW_IDS) {
      const base = founder(id), twin = founder(twinIdOf(id));
      expect(twin.genotype.loci, id).toEqual(base.genotype.loci);
      if (!base.genotype.xLoci) { expect(twin.genotype.xLoci, id).toBeUndefined(); continue; }
      const bx = base.genotype.xLoci.O!;
      if (base.sex === "F") expect(twin.genotype.xLoci, id).toEqual({ O: bx[0] === bx[1] ? [bx[0]] : ["o"] }); // tartaruga/calico → [o]
      else expect(twin.genotype.xLoci, id).toEqual({ O: [bx[0], bx[0]] }); // laranja macho [O] → fêmea [O,O]
    }
    expect(founder("gato-tartaruga-macho").genotype.xLoci).toEqual({ O: ["o"] });
    expect(founder("gato-laranja-femea").genotype.xLoci).toEqual({ O: ["O", "O"] });
  });
});

describe("texto de pelagem que o prompt gera", () => {
  const FUR_S = ", short sleek fur", FUR_L = ", long thick fluffy fur";
  const BLACK = (fur: string) => `a melanistic solid black coat with faint ghost markings${fur}`;
  const TORTIE = (fur: string) => `a tortoiseshell coat, irregular patches of black and ginger${fur}`;
  const EXPECTED: [string, string][] = [
    ["gato-laranja", `a rich ginger-orange coat, with bold vertical darker ginger stripes${FUR_S}`],
    ["gato-laranja-femea", `a rich ginger-orange coat, with bold vertical darker ginger stripes${FUR_S}`],
    ["gato-tartaruga", TORTIE(FUR_S)],
    ["gato-tartaruga-macho", BLACK(FUR_S)],
    ["gato-calico", `a calico coat, irregular patches of black and ginger with large white patches${FUR_S}`],
    ["gato-calico-macho", BLACK(FUR_S)], // o S ainda não aparece fora da família laranja: o gêmeo sai preto liso
    ["gato-persa-branco", "a pure solid white coat"],
    ["gato-persa-colorpoint", `a sandy tan plain uniform coat, with darker pointed extremities (face, ears, paws)${FUR_L}`],
    ["gato-persa-chocolate", `a solid chocolate brown coat${FUR_L}`],
    ["gato-persa-laranja", `a rich ginger-orange coat, with faint ghost tabby markings${FUR_L}`],
    ["gato-persa-tartaruga", TORTIE(FUR_L)],
    ["gato-persa-tartaruga-macho", BLACK(FUR_L)], // o gêmeo da Persa Tartaruga JÁ É o persa preto
    ["gato-maine-coon-preto", BLACK(FUR_L)],
    ["gato-maine-coon-branco", "a pure solid white coat"],
    ["gato-maine-coon-laranja", `a rich ginger-orange coat, with bold vertical darker ginger stripes${FUR_L}`],
    ["gato-maine-coon-tartaruga", TORTIE(FUR_L)],
    ["gato-abissinio-sorrel", `a solid cinnamon coat${FUR_S}`],
    ["gato-abissinio-azul", `a solid blue-grey (diluted black) coat${FUR_S}`],
    ["gato-ragdoll-blue", `a sandy tan plain uniform coat, with blue-grey pointed extremities (face, ears, paws)${FUR_L}`],
    ["gato-bengala-snow", `a sandy tan coat with round solid black spots, with darker pointed extremities (face, ears, paws)${FUR_S}`],
  ];
  it.each(EXPECTED)("%s → %s", (id, expected) => {
    expect(coatOf(id)).toBe(expected);
  });
});

describe("segregação: base × gêmeo NUNCA gera um só resultado (nenhum par de fundadores idênticos)", () => {
  const parent = (id: string): ParentInput => {
    const f = founder(id);
    return { id: f.id, genotype: f.genotype, generation: 0, sex: f.sex!, species: "felis-catus" };
  };
  const ctxFor = (a: string, b: string): CrossContext => ({
    pack: FELINE_PACK,
    pedigree: { [a]: { id: a, sire: null, dam: null }, [b]: { id: b, sire: null, dam: null } },
  });
  const kitText = (r: ReturnType<typeof cross>): string =>
    traitVector({ ...founder("gato-tabby"), id: "spc_kit", method: "F1", generation: 1, genotype: r.specimen.genotype, sex: r.specimen.sex, breed: null })[0]!;

  it.each(NEW_IDS)("%s × o próprio gêmeo: ≥ 2 pelagens distintas em 300 filhotes", (id) => {
    const sire = maleOf(id), dam = femaleOf(id);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(kitText(cross(parent(sire), parent(dam), "F1", `seg-${id}-${i}`, ctxFor(sire, dam))));
    expect(seen.size, `${id}: ${[...seen].join(" | ")}`).toBeGreaterThanOrEqual(2);
  });

  it("nenhum fundador novo é geneticamente idêntico a outro (autossomos + X + QTL), nem ao fundador da raça", () => {
    const sig = (f: StoredSpecimen) => JSON.stringify([f.genotype.loci, f.genotype.xLoci ?? null, f.genotype.qtl]);
    const seen = new Map<string, string>();
    for (const f of all.filter((x) => x.species === "felis-catus")) {
      const key = sig(f);
      // um base e o seu gêmeo sem X são cópias por construção (mesma linha); o que não pode é DUAS LINHAS diferentes iguais
      const line = baseFounderId(f.id);
      const prev = seen.get(key);
      if (prev !== undefined) expect(prev, `${f.id} idêntico a ${prev}`).toBe(line);
      seen.set(key, line);
    }
  });

  // ── O casal do artigo: herança ligada ao sexo, em número grande de filhotes ──
  const N = 2000;
  const sample = (sireId: string, damId: string, tag: string) => {
    const out: { sex: "M" | "F"; pigment: string | undefined; text: string }[] = [];
    for (let i = 0; i < N; i++) {
      const r = cross(parent(sireId), parent(damId), "F1", `${tag}-${i}`, ctxFor(sireId, damId));
      if ((r.specimen.genotype.xLoci?.O ?? []).some(isMutant)) continue; // mutação no O (µ=1e-4) fica de fora, como no golden tortoiseshell
      out.push({ sex: r.specimen.sex, pigment: r.specimen.phenotype.coatPigment, text: kitText(r) });
    }
    return out;
  };
  const TORT = /tortoiseshell|blue-cream/;
  const ORANGE = /ginger-orange|soft cream/;

  it(`TARTARUGA F × LARANJA M (os dois bases), ${N} filhotes: filhas 50% laranja / 50% tartaruga (nunca preta); filhos 50% laranja / 50% não-laranja (nunca tartaruga)`, () => {
    const kits = sample("gato-laranja", "gato-tartaruga", "casal1");
    const daughters = kits.filter((k) => k.sex === "F"), sons = kits.filter((k) => k.sex === "M");
    expect(daughters.length).toBeGreaterThan(800);
    expect(sons.length).toBeGreaterThan(800);
    // filha: X do pai é O → nunca eumelanina; O/O laranja ou O/o tartaruga
    for (const d of daughters) expect(d.pigment === "PHEOMELANIN" || d.pigment === "MOSAIC", d.text).toBe(true);
    const tortDaughters = daughters.filter((d) => d.pigment === "MOSAIC");
    expect(tortDaughters.length / daughters.length).toBeGreaterThan(0.44);
    expect(tortDaughters.length / daughters.length).toBeLessThan(0.56);
    for (const d of tortDaughters) expect(d.text).toMatch(TORT);
    // filho: X só da mãe — nunca mosaico
    for (const s of sons) expect(s.pigment === "PHEOMELANIN" || s.pigment === "EUMELANIN", s.text).toBe(true);
    const orangeSons = sons.filter((s) => s.pigment === "PHEOMELANIN");
    expect(orangeSons.length / sons.length).toBeGreaterThan(0.44);
    expect(orangeSons.length / sons.length).toBeLessThan(0.56);
    for (const s of orangeSons) expect(s.text).toMatch(ORANGE);
    for (const s of sons) expect(s.text).not.toMatch(TORT);
  });

  it(`HERANÇA CRUZADA, ${N} filhotes: pai NÃO-laranja (gêmeo macho da tartaruga, preto) × mãe LARANJA (gêmea O/O) → 100% das filhas tartaruga e 100% dos filhos laranja`, () => {
    const kits = sample("gato-tartaruga-macho", "gato-laranja-femea", "cruzada");
    const daughters = kits.filter((k) => k.sex === "F"), sons = kits.filter((k) => k.sex === "M");
    expect(daughters.length).toBeGreaterThan(800);
    expect(sons.length).toBeGreaterThan(800);
    for (const d of daughters) { expect(d.pigment, d.text).toBe("MOSAIC"); expect(d.text).toMatch(TORT); }
    for (const s of sons) { expect(s.pigment, s.text).toBe("PHEOMELANIN"); expect(s.text).toMatch(ORANGE); expect(s.text).not.toMatch(TORT); }
  });

  it("o mesmo padrão com o gato preto que já existia: pai laranja × mãe preta → filhas 100% tartaruga, filhos 100% não-laranja (pretos ou tabby)", () => {
    const kits = sample("gato-laranja", femaleOf("gato-preto"), "preto");
    const daughters = kits.filter((k) => k.sex === "F"), sons = kits.filter((k) => k.sex === "M");
    expect(daughters.length).toBeGreaterThan(800);
    for (const d of daughters) { expect(d.pigment, d.text).toBe("MOSAIC"); expect(d.text).toMatch(TORT); }
    for (const s of sons) { expect(s.pigment, s.text).toBe("EUMELANIN"); expect(s.text).not.toMatch(ORANGE); expect(s.text).not.toMatch(TORT); }
  });

  it("macho nunca é tartaruga/calico em nenhum cruzamento com calico (2 × N filhotes)", () => {
    for (const [sire, dam, tag] of [["gato-laranja", "gato-calico", "cal1"], ["gato-tartaruga-macho", "gato-calico", "cal2"]] as const) {
      for (const k of sample(sire, dam, tag).filter((x) => x.sex === "M")) {
        expect(k.pigment, k.text).not.toBe("MOSAIC");
        expect(k.text).not.toMatch(/tortoiseshell|calico|blue-cream/);
      }
    }
  });
});

describe("cacheKeys: retratos distintos onde a aparência difere, compartilhados onde não difere", () => {
  const key = (id: string) => computeCacheKey(founder(id).genotype, FELINE_PACK, founder(id).sex ?? undefined);

  it("20 retratos novos: 9 sem X (gêmeo compartilha) + 3 laranjas (gêmeo [O,O] compartilha) + 3 tartarugas × 2 + calico × 2; nenhum colide com fundador antigo", () => {
    const originalKeys = new Set(all.filter((f) => !(baseFounderId(f.id) in CAT_FOUNDER_COLOUR_VARIANTS)).map((f) => key(f.id)));
    const newSpecimens = all.filter((f) => baseFounderId(f.id) in CAT_FOUNDER_COLOUR_VARIANTS);
    const newKeys = new Set(newSpecimens.map((f) => key(f.id)));
    expect(newSpecimens.length).toBe(32);
    expect(newKeys.size).toBe(20);
    for (const k of newKeys) expect(originalKeys.has(k)).toBe(false);
    // laranja: base e gêmeo mesma chave; tartaruga/calico: gêmeo (preto) chave própria
    expect(key("gato-laranja")).toBe(key("gato-laranja-femea"));
    expect(key("gato-tartaruga")).not.toBe(key("gato-tartaruga-macho"));
    expect(key("gato-persa-branco")).toBe(key(twinIdOf("gato-persa-branco")));
  });

  it("fundadores ORIGINAIS continuam sem xLoci (mesma fórmula de chave de sempre)", () => {
    for (const f of all.filter((x) => x.pack === "feline" && !(baseFounderId(x.id) in CAT_FOUNDER_COLOUR_VARIANTS))) {
      expect(f.genotype.xLoci, f.id).toBeUndefined();
    }
  });
});
