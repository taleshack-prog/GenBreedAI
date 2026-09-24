/**
 * ADR-0035 — o locus O (laranja, ligado ao X) chega ao jogador: o prompt lê o `coatPigment` do motor (laranja, creme, tartaruga,
 * azul-creme, calico), o laranja MASCARA o preto/chocolate, o gêmeo de fundador trata o X, e nenhum fundador atual mudou.
 * Não há fundador laranja ainda: os casos abaixo montam o genótipo à mão.
 */
import { describe, it, expect } from "vitest";
import { baseFounderId, CAT_FOUNDER_COLOUR_VARIANTS, type Genotype, type Sex } from "@genbreedai/shared";
import { cross, expressPhenotype, FELINE_PACK, hashGenotype, type ParentInput, type CrossContext, type Pedigree } from "@genbreedai/engine";
import { founderSeeds, twinGenotype, type StoredSpecimen } from "../src/specimens/in-memory.repository";
import { buildPrompt, traitVector } from "../src/images/prompt";

const founder = (id: string): StoredSpecimen => founderSeeds().find((f) => f.id === id)!;
const FUR = ", short sleek fur"; // sufixo de Fl^s/Fl^s do gato-tabby, inalterado

/** Espécime a partir do gato-tabby (pelo curto, P liso, a/a) com loci, X e sexo trocados. */
function cat(opts: { loci?: Record<string, [string, string]>; xLoci?: Genotype["xLoci"]; sex?: Sex }): StoredSpecimen {
  const f = founder("gato-tabby");
  const genotype: Genotype = structuredClone(f.genotype);
  genotype.loci.A = ["a", "a"]; genotype.loci.P = ["P^t", "P^t"];
  for (const [k, v] of Object.entries(opts.loci ?? {})) genotype.loci[k] = v;
  if (opts.xLoci) genotype.xLoci = opts.xLoci;
  return { ...f, id: "spc_x_0001", method: "F1", generation: 1, genotype, sex: opts.sex ?? "F", breed: null };
}
const coat = (opts: Parameters<typeof cat>[0]) => traitVector(cat(opts))[0]!;

describe("os 5 pigmentos — texto exato", () => {
  it("laranja/vermelho (macho [O]): 'a rich ginger-orange coat'", () => {
    expect(coat({ sex: "M", xLoci: { O: ["O"] } })).toBe(`a rich ginger-orange coat, with faint ghost tabby markings${FUR}`);
  });

  it("creme (laranja + d/d): 'a soft cream coat'", () => {
    expect(coat({ sex: "M", xLoci: { O: ["O"] }, loci: { D: ["d", "d"] } })).toBe(`a soft cream coat, with faint ghost tabby markings${FUR}`);
  });

  it("tartaruga (fêmea O/o): 'a tortoiseshell coat, irregular patches of black and ginger'", () => {
    expect(coat({ sex: "F", xLoci: { O: ["O", "o"] } })).toBe(`a tortoiseshell coat, irregular patches of black and ginger${FUR}`);
  });

  it("azul-creme (fêmea O/o + d/d): versão diluída da tartaruga", () => {
    expect(coat({ sex: "F", xLoci: { O: ["O", "o"] }, loci: { D: ["d", "d"] } })).toBe(`a blue-cream coat, irregular patches of blue-grey and soft cream${FUR}`);
  });

  it("calico (fêmea O/o + S): tartaruga com branco — o S entra AQUI, na família laranja", () => {
    expect(coat({ sex: "F", xLoci: { O: ["O", "o"] }, loci: { S: ["S", "s"] } }))
      .toBe(`a calico coat, irregular patches of black and ginger with large white patches${FUR}`);
    expect(coat({ sex: "F", xLoci: { O: ["O", "o"] }, loci: { S: ["S", "s"], D: ["d", "d"] } }))
      .toBe(`a dilute calico coat, irregular patches of blue-grey and soft cream with large white patches${FUR}`);
  });

  it("laranja e branco (macho [O] + S) e fêmea O/O: laranja também", () => {
    expect(coat({ sex: "M", xLoci: { O: ["O"] }, loci: { S: ["S", "s"] } }))
      .toBe(`a rich ginger-orange coat, with faint ghost tabby markings, with white patches on the chest, belly and paws${FUR}`);
    expect(coat({ sex: "F", xLoci: { O: ["O", "O"] } })).toContain("a rich ginger-orange coat");
  });

  it("padrões marcados no laranja: listras/pintas/rosetas em tom mais escuro do gengibre (O não mascara P)", () => {
    expect(coat({ sex: "M", xLoci: { O: ["O"] }, loci: { P: ["P^m", "P^m"] } })).toBe(`a rich ginger-orange coat, with bold vertical darker ginger stripes${FUR}`);
    expect(coat({ sex: "M", xLoci: { O: ["O"] }, loci: { P: ["P^s", "P^s"] } })).toContain("round solid darker ginger spots");
    expect(coat({ sex: "M", xLoci: { O: ["O"] }, loci: { P: ["P^r", "P^r"] } })).toContain("darker ginger rosettes");
  });
});

describe("o laranja MASCARA o preto e o chocolate (ordem: pelado > branco > albino > LARANJA > preto/cor)", () => {
  it("O/O com melanismo (A_) não sai preto: sai laranja", () => {
    const c = coat({ sex: "F", xLoci: { O: ["O", "O"] }, loci: { A: ["A", "a"] } });
    expect(c).toContain("a rich ginger-orange coat");
    expect(c).not.toContain("melanistic");
    expect(c).not.toContain("black");
  });

  it("O/O com chocolate (b/b) não sai chocolate; canela idem; lilás/azul (d/d) vira CREME", () => {
    expect(coat({ sex: "M", xLoci: { O: ["O"] }, loci: { B: ["b", "b"] } })).not.toContain("chocolate");
    expect(coat({ sex: "M", xLoci: { O: ["O"] }, loci: { B: ["b^l", "b^l"] } })).not.toContain("cinnamon");
    const cream = coat({ sex: "M", xLoci: { O: ["O"] }, loci: { B: ["b", "b"], D: ["d", "d"] } });
    expect(cream).toContain("a soft cream coat");
    expect(cream).not.toContain("lilac");
  });

  it("na tartaruga, a parte escura É a cor de B×D (preto, chocolate, azul-cinza), a clara é gengibre/creme", () => {
    expect(coat({ sex: "F", xLoci: { O: ["O", "o"] }, loci: { B: ["b", "b"] } })).toContain("irregular patches of chocolate brown and ginger");
    expect(coat({ sex: "F", xLoci: { O: ["O", "o"] }, loci: { A: ["A", "a"] } })).toContain("patches of black and ginger");
    expect(coat({ sex: "F", xLoci: { O: ["O", "o"] }, loci: { B: ["b", "b"], D: ["d", "d"] } })).toBe(`a dilute tortoiseshell coat, irregular patches of lilac and soft cream${FUR}`);
  });

  it("branco dominante e albino vencem o laranja; sphynx pelado continua sem cor", () => {
    expect(coat({ sex: "M", xLoci: { O: ["O"] }, loci: { W: ["W", "w"] } })).toContain("a pure solid white coat");
    expect(coat({ sex: "M", xLoci: { O: ["O"] }, loci: { C: ["c", "c"] } })).toContain("true albino appearance");
    expect(coat({ sex: "M", xLoci: { O: ["O"] }, loci: { Hr: ["hr", "hr"] } })).toContain("completely hairless");
  });

  it("gato de PONTOS + laranja: corpo no tom de fundo e pontos vermelhos/creme/tartaruga", () => {
    const siamese = (xLoci: Genotype["xLoci"], sex: Sex, loci: Record<string, [string, string]> = {}) => {
      const f = founder("gato-siames");
      const genotype: Genotype = { ...structuredClone(f.genotype), xLoci };
      for (const [k, v] of Object.entries(loci)) genotype.loci[k] = v;
      return traitVector({ ...f, id: "spc_x_0002", method: "F1", genotype, sex, breed: null })[0]!;
    };
    expect(siamese({ O: ["O"] }, "M")).toContain("a sandy tan plain uniform coat, with ginger-orange pointed extremities (face, ears, paws)");
    expect(siamese({ O: ["O"] }, "M", { D: ["d", "d"] })).toContain("with cream pointed extremities");
    expect(siamese({ O: ["O", "o"] }, "F")).toContain("with tortoiseshell pointed extremities");
  });
});

describe("eumelanina (macho [o], fêmea o/o, sem X): texto IDÊNTICO ao de antes", () => {
  it("[o], [o,o] e sem xLoci produzem a mesma pelagem, também em preto, chocolate e azul", () => {
    for (const loci of [{}, { A: ["A", "a"] }, { B: ["b", "b"] }, { D: ["d", "d"] }] as Record<string, [string, string]>[]) {
      const none = coat({ sex: "F", loci });
      expect(coat({ sex: "M", loci, xLoci: { O: ["o"] } }), JSON.stringify(loci)).toBe(none);
      expect(coat({ sex: "F", loci, xLoci: { O: ["o", "o"] } }), JSON.stringify(loci)).toBe(none);
    }
  });
});

describe("macho nunca é tartaruga (motor: hemizigoto)", () => {
  const AUTOSOMAL: Record<string, [string, string]> = {
    A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "D"], W: ["w", "w"], S: ["s", "s"],
    Ma: ["ma", "ma"], Fl: ["Fl^s", "Fl^s"], Hr: ["Hr", "Hr"], Bd: ["Bd^d", "Bd^d"], He: ["He^r", "He^r"], Ec: ["Ec^n", "Ec^n"],
  };
  const pedigree: Pedigree = { sire: { id: "sire", sire: null, dam: null }, dam: { id: "dam", sire: null, dam: null } };
  const ctx: CrossContext = { pack: FELINE_PACK, pedigree };
  const parent = (id: string, sex: Sex, xLoci: Genotype["xLoci"]): ParentInput =>
    ({ id, genotype: { loci: AUTOSOMAL, qtl: {}, xLoci }, generation: 0, sex, species: "felis-catus" });

  it("mãe tartaruga O/o × pai [O]: 300 filhotes — nenhum macho com texto de tartaruga/calico/azul-creme; existem filhas tartaruga", () => {
    const sire = parent("sire", "M", { O: ["O"] });
    const dam = parent("dam", "F", { O: ["O", "o"] });
    let tortieDaughters = 0, sons = 0;
    for (let i = 0; i < 300; i++) {
      const r = cross(sire, dam, "F1", `orange-${i}`, ctx);
      const base = founder("gato-tabby");
      const stored: StoredSpecimen = { ...base, id: "spc_kit", method: "F1", generation: 1, genotype: r.specimen.genotype, sex: r.specimen.sex, breed: null };
      const text = buildPrompt(stored);
      if (r.specimen.sex === "M") {
        sons++;
        expect(r.specimen.phenotype.coatPigment).not.toBe("MOSAIC");
        expect(text).not.toMatch(/tortoiseshell|calico|blue-cream/);
        expect((r.specimen.genotype.xLoci?.O ?? []).length).toBe(1);
      } else if (text.includes("a tortoiseshell coat")) tortieDaughters++;
    }
    expect(sons).toBeGreaterThan(0);
    expect(tortieDaughters).toBeGreaterThan(0);
  });
});

describe("gêmeo de fundador: o X é tratado, não copiado", () => {
  const tw = (x: Genotype["xLoci"], twinSex: Sex) => twinGenotype({ ...founder("gato-tabby").genotype, xLoci: x }, twinSex, "feline").xLoci;

  it("fêmea O/O → macho [O]; fêmea o/o → macho [o]; fêmea O/o (tartaruga) → macho [o]", () => {
    expect(tw({ O: ["O", "O"] }, "M")).toEqual({ O: ["O"] });
    expect(tw({ O: ["o", "o"] }, "M")).toEqual({ O: ["o"] });
    expect(tw({ O: ["O", "o"] }, "M")).toEqual({ O: ["o"] });
    expect(tw({ O: ["o", "O"] }, "M")).toEqual({ O: ["o"] });
  });

  it("macho [O] → fêmea [O,O]; macho [o] → fêmea [o,o]", () => {
    expect(tw({ O: ["O"] }, "F")).toEqual({ O: ["O", "O"] });
    expect(tw({ O: ["o"] }, "F")).toEqual({ O: ["o", "o"] });
  });

  it("X do gêmeo é sempre válido para o sexo (macho 1 alelo, fêmea 2) e o fenótipo de cor é preservado quando possível", () => {
    const pigment = (x: Genotype["xLoci"], sex: Sex) => expressPhenotype({ loci: founder("gato-tabby").genotype.loci, qtl: {}, xLoci: x }, FELINE_PACK, sex).coatPigment;
    expect(pigment(tw({ O: ["O", "O"] }, "M"), "M")).toBe("PHEOMELANIN"); // fêmea laranja → macho laranja
    expect(pigment(tw({ O: ["O"] }, "F"), "F")).toBe("PHEOMELANIN"); // macho laranja → fêmea laranja
    expect(pigment(tw({ O: ["O", "o"] }, "M"), "M")).toBe("EUMELANIN"); // tartaruga → macho de cor de base (nunca MOSAIC)
    for (const x of [{ O: ["O", "O"] }, { O: ["O", "o"] }, { O: ["o", "o"] }] as Genotype["xLoci"][]) expect(tw(x, "M")!.O!.length).toBe(1);
    for (const x of [{ O: ["O"] }, { O: ["o"] }] as Genotype["xLoci"][]) expect(tw(x, "F")!.O!.length).toBe(2);
  });

  it("os autossomos são cópia PROFUNDA (mexer no gêmeo não altera o base) e sem xLoci o gêmeo é cópia idêntica de sempre", () => {
    const base = founder("gato-tabby");
    const twin = twinGenotype(base.genotype, "F", "feline");
    expect(twin).toEqual(base.genotype);
    expect(twin.xLoci).toBeUndefined();
    twin.loci.A = ["A", "A"];
    expect(base.genotype.loci.A).toEqual(["a", "a"]);
  });
});

describe("fundadores atuais — nada mudou", () => {
  // SÓ os originais: os fundadores de cor (ADR-0036) laranja/tartaruga/calico TÊM xLoci de propósito.
  const originals = () => founderSeeds().filter((x) => x.pack === "feline" && !(baseFounderId(x.id) in CAT_FOUNDER_COLOUR_VARIANTS));

  it("nenhum tem xLoci (todos assumem 'o'), nem no gêmeo; a chave de hash não ganha o sufixo do X", () => {
    for (const f of originals()) {
      expect(f.genotype.xLoci, f.id).toBeUndefined();
      expect("xLoci" in f.genotype, f.id).toBe(false);
      expect(hashGenotype(f.genotype), f.id).not.toContain("|x{");
    }
  });

  it("o prompt de todo fundador felino não muda com a leitura do X (mesmo texto com e sem passar xLoci ao motor)", () => {
    for (const f of originals()) {
      const withX = expressPhenotype({ loci: f.genotype.loci, qtl: {}, xLoci: f.genotype.xLoci }, FELINE_PACK, f.sex ?? undefined);
      const without = expressPhenotype({ loci: f.genotype.loci, qtl: {} }, FELINE_PACK, f.sex ?? undefined);
      expect(withX.loci, f.id).toEqual(without.loci);
      expect(withX.coatPigment, f.id).toBeUndefined();
      expect(buildPrompt(f), f.id).toContain("Full-body professional studio wildlife photograph");
    }
  });
});
