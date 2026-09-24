/**
 * Portadores ocultos nos 12 fundadores de gato doméstico (aprovado nesta
 * rodada — ver docs/gene-bank/felinos-genetica.md §"Portadores ocultos por
 * fundador"). Item 2 do pedido: PROVA de que nenhum fenótipo VISÍVEL de
 * fundador mudou — `expressPhenotype()` de cada um dos 12, ANTES (genótipo
 * hardcoded aqui, exatamente como estava em `in-memory.repository.ts` antes
 * desta rodada) e DEPOIS (o founder de verdade, via `founderSeeds()`), tem
 * que dar o MESMO `.loci`. Item 3: segregação real — ragdoll×maine-coon
 * gera mais de 4 combinações; tabby×siamês gera mais de 1 (era o bug
 * original: os dois eram homozigotos em tudo, sempre 1 única combinação).
 */
import { describe, it, expect } from "vitest";
import { expressPhenotype, FELINE_PACK, enumerateOffspring } from "@genbreedai/engine";
import type { Genotype, Sex } from "@genbreedai/shared";
import { founderSeeds, FOUNDER_SEX } from "../src/specimens/in-memory.repository";

/** Genótipo EXATO de cada um dos 12 fundadores ANTES desta rodada (cópia literal do que estava em in-memory.repository.ts). */
const BEFORE: Record<string, Genotype> = {
  "gato-tabby": { loci: { A: ["a","a"], P: ["P^m","P^m"], B: ["B","B"], C: ["C","C"], D: ["D","D"], W: ["w","w"], S: ["s","s"], Ma: ["ma","ma"], Bd: ["Bd^d","Bd^d"], He: ["He^r","He^r"], Ec: ["Ec^n","Ec^n"], Fl: ["Fl^s","Fl^s"], Hr: ["Hr","Hr"] }, qtl: {} },
  "gato-siames": { loci: { A: ["a","a"], P: ["P^t","P^t"], B: ["B","B"], C: ["c^s","c^s"], D: ["D","D"], W: ["w","w"], S: ["s","s"], Ma: ["ma","ma"], Bd: ["Bd^s","Bd^s"], He: ["He^a","He^a"], Ec: ["Ec^n","Ec^n"], Fl: ["Fl^s","Fl^s"], Hr: ["Hr","Hr"] }, qtl: {} },
  "gato-preto": { loci: { A: ["A","A"], P: ["P^t","P^t"], B: ["B","B"], C: ["C","C"], D: ["D","D"], W: ["w","w"], S: ["s","s"], Ma: ["ma","ma"], Bd: ["Bd^g","Bd^g"], He: ["He^r","He^r"], Ec: ["Ec^n","Ec^n"], Fl: ["Fl^s","Fl^s"], Hr: ["Hr","Hr"] }, qtl: {} },
  "gato-branco": { loci: { A: ["a","a"], P: ["P^t","P^t"], B: ["B","B"], C: ["C","C"], D: ["D","D"], W: ["W","w"], S: ["s","s"], Ma: ["ma","ma"], Bd: ["Bd^s","Bd^s"], He: ["He^r","He^r"], Ec: ["Ec^n","Ec^n"], Fl: ["Fl^s","Fl^s"], Hr: ["Hr","Hr"] }, qtl: {} },
  "gato-maine-coon": { loci: { A: ["a","a"], P: ["P^m","P^m"], B: ["B","B"], C: ["C","C"], D: ["D","D"], W: ["w","w"], S: ["s","s"], Ma: ["ma","ma"], Bd: ["Bd^d","Bd^d"], He: ["He^b","He^b"], Ec: ["Ec^t","Ec^t"], Fl: ["Fl^l","Fl^l"], Hr: ["Hr","Hr"] }, qtl: {} },
  "gato-persa": { loci: { A: ["a","a"], P: ["P^t","P^t"], B: ["B","B"], C: ["C","C"], D: ["D","D"], W: ["w","w"], S: ["s","s"], Ma: ["ma","ma"], Bd: ["Bd^s","Bd^s"], He: ["He^r","He^r"], Ec: ["Ec^n","Ec^n"], Fl: ["Fl^l","Fl^l"], Hr: ["Hr","Hr"] }, qtl: {} },
  "gato-bengala": { loci: { A: ["a","a"], P: ["P^s","P^s"], B: ["B","B"], C: ["C","C"], D: ["D","D"], W: ["w","w"], S: ["s","s"], Ma: ["ma","ma"], Bd: ["Bd^d","Bd^d"], He: ["He^r","He^r"], Ec: ["Ec^n","Ec^n"], Fl: ["Fl^s","Fl^s"], Hr: ["Hr","Hr"] }, qtl: {} },
  "gato-birmania": { loci: { A: ["a","a"], P: ["P^t","P^t"], B: ["B","B"], C: ["c^s","c^s"], D: ["D","D"], W: ["w","w"], S: ["S","s"], Ma: ["ma","ma"], Bd: ["Bd^d","Bd^d"], He: ["He^r","He^r"], Ec: ["Ec^n","Ec^n"], Fl: ["Fl^l","Fl^l"], Hr: ["Hr","Hr"] }, qtl: {} },
  "gato-sphynx": { loci: { A: ["a","a"], P: ["P^t","P^t"], B: ["B","B"], C: ["C","C"], D: ["D","D"], W: ["w","w"], S: ["s","s"], Ma: ["ma","ma"], Bd: ["Bd^s","Bd^s"], He: ["He^a","He^a"], Ec: ["Ec^l","Ec^l"], Fl: ["Fl^s","Fl^s"], Hr: ["hr","hr"] }, qtl: {} },
  "gato-mau-egipcio": { loci: { A: ["a","a"], P: ["P^s","P^s"], B: ["B","B"], C: ["C","C"], D: ["D","D"], W: ["w","w"], S: ["s","s"], Ma: ["ma","ma"], Bd: ["Bd^g","Bd^g"], He: ["He^a","He^a"], Ec: ["Ec^n","Ec^n"], Fl: ["Fl^s","Fl^s"], Hr: ["Hr","Hr"] }, qtl: {} },
  "gato-abissinio": { loci: { A: ["a","a"], P: ["P^t","P^t"], B: ["B","B"], C: ["C","C"], D: ["D","D"], W: ["w","w"], S: ["s","s"], Ma: ["ma","ma"], Bd: ["Bd^a","Bd^a"], He: ["He^a","He^a"], Ec: ["Ec^n","Ec^n"], Fl: ["Fl^s","Fl^s"], Hr: ["Hr","Hr"] }, qtl: {} },
  "gato-ragdoll": { loci: { A: ["a","a"], P: ["P^t","P^t"], B: ["B","B"], C: ["c^s","c^s"], D: ["D","D"], W: ["w","w"], S: ["S","s"], Ma: ["ma","ma"], Bd: ["Bd^s","Bd^s"], He: ["He^b","He^b"], Ec: ["Ec^n","Ec^n"], Fl: ["Fl^l","Fl^l"], Hr: ["Hr","Hr"] }, qtl: {} },
};

describe("Portadores ocultos — item 2: fenótipo VISÍVEL de fundador idêntico antes/depois", () => {
  // SÓ os 12 fundadores ORIGINAIS de gato (chaves de BEFORE): os 16 fundadores de cor (ADR-0036) têm testes próprios e não fazem parte deste snapshot.
  const founders = founderSeeds().filter((f) => f.species === "felis-catus" && !f.id.endsWith("-femea") && !f.id.endsWith("-macho") && f.id in BEFORE);

  it("os 12 fundadores-base de felis-catus existem (nenhum sumiu/mudou de id)", () => {
    expect(founders.map((f) => f.id).sort()).toEqual(Object.keys(BEFORE).sort());
  });

  it.each(Object.keys(BEFORE))("%s: expressPhenotype antes === depois", (id) => {
    const after = founders.find((f) => f.id === id);
    expect(after, `fundador ${id} não encontrado em founderSeeds()`).toBeDefined();
    const sex: Sex = FOUNDER_SEX[id]!;
    const before = expressPhenotype(BEFORE[id]!, FELINE_PACK, sex);
    const now = expressPhenotype(after!.genotype, FELINE_PACK, sex);
    expect(now.loci, `fenótipo de ${id} MUDOU — parar e reportar`).toEqual(before.loci);
  });

  it("gêmeos (twin, sexo oposto) continuam cópia do MESMO genótipo do fundador-base", () => {
    const all = founderSeeds();
    for (const id of Object.keys(BEFORE)) {
      const base = all.find((f) => f.id === id)!;
      const twinId = FOUNDER_SEX[id] === "M" ? `${id}-femea` : `${id}-macho`;
      const twin = all.find((f) => f.id === twinId);
      expect(twin, `gêmeo ${twinId} não encontrado`).toBeDefined();
      expect(twin!.genotype).toEqual(base.genotype); // mesmo genótipo — só o sexo (já coberto por FOUNDER_SEX) muda
      expect(twin!.genotype).not.toBe(base.genotype); // cópia PROFUNDA (structuredClone), não a mesma referência
    }
  });
});

describe("Portadores ocultos — item 3: segregação real (era o bug em produção)", () => {
  it("ragdoll × maine-coon: EXATAMENTE 4 combinações distintas de fenótipo", async () => {
    // Conta locus por locus (13 loci felinos) — só os que têm um pai
    // heterozigoto E cuja variação sobrevive à dominância do outro pai:
    //   A/B/D/W/Ma/Hr: os dois pais homozigotos NO MESMO alelo → 1 saída.
    //   P: ragdoll P^t/P^t × maine-coon P^m/P^m — os DOIS homozigotos (P não
    //      é um dos loci-portador deste par) → sempre P^m/P^t, 1 saída.
    //   C: ragdoll c^s/c^s × maine-coon C/C → sempre C/c^s, 1 saída.
    //   Bd: ragdoll Bd^s/Bd^s × maine-coon Bd^d/Bd^d → sempre Bd^d/Bd^s
    //      ("dourado", Bd^d dominante), 1 saída.
    //   He: os dois He^b/He^b (mesmo alelo) → 1 saída.
    //   S: ragdoll S/s (portador) × maine-coon s/s → 1/2 S/s "bicolor",
    //      1/2 s/s "sólido" → 2 saídas.
    //   Ec: ragdoll Ec^n/Ec^n × maine-coon Ec^t/Ec^n (portador) → 1/2
    //      Ec^t/Ec^n "tufadas", 1/2 Ec^n/Ec^n "normais" → 2 saídas.
    //   Fl: ragdoll Fl^l/Fl^l (dominante fixo) × maine-coon Fl^l/Fl^s
    //      (portador) → 1/2 Fl^l/Fl^l, 1/2 Fl^l/Fl^s — AMBOS "pelo longo"
    //      (Fl^l domina) — MESMO fenótipo nos dois casos, não conta como 2ª
    //      saída (é exatamente o ragdoll ser dominante-fixo que mascara o
    //      portador do maine-coon aqui — previsão anterior de "8" errou por
    //      supor P também segregando neste par específico, que não é um dos
    //      loci-portador nem de ragdoll nem de maine-coon).
    // Total: S(2) × Ec(2) = 4.
    const all = founderSeeds();
    const ragdoll = all.find((f) => f.id === "gato-ragdoll")!; // F
    const maineCoon = all.find((f) => f.id === "gato-maine-coon")!; // M
    // enumerateOffspring exige parentA=macho (sire) e parentB=fêmea (dam).
    const a = { id: maineCoon.id, genotype: maineCoon.genotype, generation: 0, sex: maineCoon.sex!, species: "felis-catus" };
    const b = { id: ragdoll.id, genotype: ragdoll.genotype, generation: 0, sex: ragdoll.sex!, species: "felis-catus" };
    const opts = enumerateOffspring(a, b, { pack: FELINE_PACK, pedigree: {}, interspecific: false }, 6);
    expect(opts.length).toBe(4);
  });

  it("gato-tabby × gato-siames: EXATAMENTE 4 combinações (era o bug — os dois eram homozigotos em tudo, sempre davam 1 só)", async () => {
    // Conta locus por locus:
    //   P: tabby P^m/P^t (portador) × siames P^t/P^t → 1/2 P^m/P^t
    //      "listras" (P^m domina), 1/2 P^t/P^t "uniforme" → 2 saídas.
    //   C: tabby C/c^b (portador) × siames c^s/c^s → 1/2 C/c^s "pleno" (C
    //      domina c^s), 1/2 c^b/c^s "sépia" (c^b domina c^s, rank
    //      C>c^b>c^s>c^a>c) → 2 saídas — as DUAS combinações do siames
    //      revelam fenótipos DIFERENTES (dif. de ragdoll×maine-coon, onde a
    //      dominante do outro pai mascarava tudo).
    //   Bd: tabby Bd^d/Bd^d (dominante fixo) × siames Bd^s/Bd^g (portador)
    //      → 1/2 Bd^d/Bd^s, 1/2 Bd^d/Bd^g — AMBOS "dourado" (Bd^d domina os
    //      dois) — MESMO fenótipo, não soma saída (mesmo padrão de
    //      mascaramento do Fl em ragdoll×maine-coon).
    //   Demais 10 loci: pelo menos um dos pais homozigoto no MESMO alelo
    //      que o outro, ou os dois homozigotos sem heterozigose nenhuma → 1
    //      saída cada.
    // Total: P(2) × C(2) = 4.
    const all = founderSeeds();
    const tabby = all.find((f) => f.id === "gato-tabby")!;
    const siames = all.find((f) => f.id === "gato-siames")!;
    const a = { id: tabby.id, genotype: tabby.genotype, generation: 0, sex: tabby.sex!, species: "felis-catus" };
    const b = { id: siames.id, genotype: siames.genotype, generation: 0, sex: siames.sex!, species: "felis-catus" };
    const opts = enumerateOffspring(a, b, { pack: FELINE_PACK, pedigree: {}, interspecific: false }, 6);
    expect(opts.length).toBe(4);
  });
});
