/**
 * Portadores ocultos nos fundadores CANINOS (docs/gene-bank/caninos-genetica.md
 * §"Portadores ocultos por fundador"). Mesma ideia de `founder-carriers.spec.ts`
 * (felinos), com 47 fundadores-base:
 *   - 37 eram 100% homozigotos e ganharam 1-2 portadores (`NEW_CARRIERS`);
 *   - 10 já tinham heterozigose (`PRE_EXISTING`, nunca documentada) e NÃO mudam.
 *
 * Item 2 do pedido: PROVA de que nenhum fenótipo VISÍVEL de fundador mudou.
 * O "antes" dos 37 é reconstruído da tabela literal abaixo (alelo do TOPO do
 * ranking = o alelo homozigoto original de cada locus) e comparado com o
 * fundador de verdade (`founderSeeds()`) via `expressPhenotype()` completo.
 * Os 10 pré-existentes não foram tocados: o teste os TRAVA (genótipo
 * heterozigoto exato) — qualquer mudança neles reprova aqui.
 *
 * Item 3: segregação real — 3 pares populares passam a gerar mais de 1
 * combinação (antes: sempre 1 — todos homozigotos), com a conta locus a locus.
 */
import { describe, it, expect } from "vitest";
import { expressPhenotype, enumerateOffspring, CANINE_PACK } from "@genbreedai/engine";
import type { Genotype } from "@genbreedai/shared";
import { founderSeeds, FOUNDER_SEX } from "../src/specimens/in-memory.repository";

type Carrier = [locus: string, top: string, carried: string];

/** Único conjunto de loci onde o pack canino tem dominância COMPLETA (só estes podem esconder um portador). */
const COMPLETE_LOCI = ["B", "K", "A", "E", "R", "D", "Cl", "Ct", "Tl"];

/** 37 fundadores que eram 100% homozigotos. `top` = alelo original (homozigoto) do fundador; `carried` = recessivo escondido abaixo dele. */
const NEW_CARRIERS: Record<string, Carrier[]> = {
  boerboel: [["K", "K^br", "k^y"], ["A", "A^y", "a"]],
  "dogue-dourado": [["B", "B", "b"], ["D", "D", "d"]],
  "dogue-tigrado": [["B", "B", "b"], ["K", "K^br", "k^y"]],
  "dogue-preto": [["B", "B", "b"], ["D", "D", "d"]],
  "dogue-azul": [["B", "B", "b"]],
  "dogue-manto": [["B", "B", "b"], ["E", "E", "e"]],
  rottweiler: [["B", "B", "b"], ["E", "E", "e"]],
  "sao-bernardo": [["Cl", "Cl^l", "Cl^s"], ["A", "A^y", "a^t"]],
  "dogo-argentino": [["B", "B", "b"], ["A", "A^y", "a"]],
  "mastim-ingles": [["B", "B", "b"], ["A", "A^y", "a"]],
  collie: [["Cl", "Cl^l", "Cl^s"], ["A", "A^y", "a^t"]],
  "border-collie": [["Cl", "Cl^l", "Cl^s"], ["B", "B", "b"]],
  "bulldog-frances": [["K", "K^br", "k^y"], ["D", "D", "d"]],
  greyhound: [["B", "B", "b"], ["D", "D", "d"]],
  "cane-corso": [["B", "B", "b"], ["D", "D", "d"]],
  "mastim-napolitano": [["B", "B", "b"], ["E", "E", "e"]],
  "bull-mastiff": [["B", "B", "b"], ["A", "A^y", "a"]],
  kangal: [["B", "B", "b"], ["D", "D", "d"]],
  alabai: [["B", "B", "b"], ["D", "D", "d"]],
  "pastor-caucaso": [["Cl", "Cl^l", "Cl^s"], ["A", "A^y", "a^t"]],
  "mastim-tibetano": [["A", "a^t", "a"], ["B", "B", "b"]],
  "terra-nova": [["B", "B", "b"], ["E", "E", "e"]],
  "pastor-belga-malinois": [["B", "B", "b"], ["A", "A^y", "a"]],
  "pastor-belga-groenendael": [["B", "B", "b"], ["Cl", "Cl^l", "Cl^s"]],
  "pastor-serra-estrela": [["Cl", "Cl^l", "Cl^s"], ["A", "A^y", "a"]],
  "old-english-sheepdog": [["B", "B", "b"], ["E", "E", "e"]],
  "blue-heeler": [["R", "R", "r"], ["B", "B", "b"]],
  "pastor-shetland": [["B", "B", "b"], ["A", "A^y", "a^t"]],
  "terrier-brasileiro": [["A", "a^t", "a"], ["B", "B", "b"]],
  "terrier-anao-branco": [["B", "B", "b"], ["A", "A^y", "a^t"]],
  "bulldog-americano": [["B", "B", "b"], ["A", "A^y", "a"]],
  "buldogue-campeiro": [["B", "B", "b"], ["A", "A^y", "a"]],
  "spitz-alemao": [["B", "B", "b"], ["A", "A^y", "a"]],
  "irish-wolfhound": [["Ct", "Ct^w", "Ct^n"], ["B", "B", "b"]],
  whippet: [["B", "B", "b"], ["D", "D", "d"]],
  saluki: [["B", "B", "b"], ["A", "A^y", "a^t"]],
  "afghan-hound": [["B", "B", "b"], ["A", "A^y", "a"]],
};

/** 10 fundadores que JÁ eram heterozigotos antes desta rodada (não documentados até aqui) — genótipo heterozigoto EXATO, travado. */
const PRE_EXISTING: Record<string, Record<string, [string, string]>> = {
  "braco-alemao": { E: ["E", "e"] },
  dobermann: { B: ["B", "b"], D: ["D", "d"] },
  "dogue-arlequim": { M: ["M", "m"], H: ["H", "h"] },
  "pastor-alemao": { Cl: ["Cl^l", "Cl^s"] },
  "presa-canaria": { K: ["K^br", "k^y"] },
  cimarron: { K: ["K^br", "k^y"] },
  "pastor-pampeano": { Cl: ["Cl^l", "Cl^s"] },
  "australian-shepherd": { M: ["M", "m"], Cl: ["Cl^l", "Cl^s"] },
  "pit-bull": { K: ["K^br", "k^y"] },
  "bulldog-ingles": { K: ["K^br", "k^y"] },
};

/** AJUSTE 1 do pedido: D/d só nestes 8 (cor diluída notória na raça). */
const D_ALLOWED = ["cane-corso", "bulldog-frances", "dogue-dourado", "dogue-preto", "whippet", "greyhound", "kangal", "alabai"];

const all = founderSeeds();
const isTwin = (id: string) => id.endsWith("-femea") || id.endsWith("-macho");
const canineBase = all.filter((f) => f.pack === "canine" && !isTwin(f.id));

function hetLoci(g: Genotype): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const [locus, pair] of Object.entries(g.loci)) if (pair[0] !== pair[1]) out[locus] = [pair[0], pair[1]];
  return out;
}
const sortedPair = (p: readonly [string, string]) => [...p].sort();

describe("Portadores ocultos caninos — cobertura dos 47 fundadores", () => {
  it("47 fundadores-base caninos = 37 novos + 10 pré-existentes, sem sobreposição", () => {
    const newIds = Object.keys(NEW_CARRIERS);
    const preIds = Object.keys(PRE_EXISTING);
    expect(canineBase.length).toBe(47);
    expect(newIds.length).toBe(37);
    expect(preIds.length).toBe(10);
    expect(newIds.filter((id) => preIds.includes(id))).toEqual([]);
    expect([...newIds, ...preIds].sort()).toEqual(canineBase.map((f) => f.id).sort());
  });

  it("nenhum fundador canino (base ou gêmeo) tem mais de 2 loci heterozigotos", () => {
    for (const f of all.filter((x) => x.pack === "canine")) {
      expect(Object.keys(hetLoci(f.genotype)).length, `${f.id} passou de 2 loci heterozigotos`).toBeLessThanOrEqual(2);
    }
  });

  it("AJUSTE 1: D/d só nos 8 fundadores autorizados", () => {
    const withD = Object.entries(NEW_CARRIERS).filter(([, cs]) => cs.some(([l]) => l === "D")).map(([id]) => id);
    expect(withD.sort()).toEqual([...D_ALLOWED].sort());
    // e o genótipo REAL bate com a tabela: nenhum outro fundador-base tem D heterozigoto além do dobermann (pré-existente).
    const realD = canineBase.filter((f) => "D" in hetLoci(f.genotype)).map((f) => f.id).filter((id) => id !== "dobermann");
    expect(realD.sort()).toEqual([...D_ALLOWED].sort());
  });

  it("AJUSTE 2: rottweiler e blue-heeler NÃO carregam 'a' sob a^t; blue-heeler mantém r sob R", () => {
    for (const id of ["rottweiler", "blue-heeler"]) {
      expect(NEW_CARRIERS[id]!.some(([l]) => l === "A"), `${id} não pode ter portador em A`).toBe(false);
      const f = canineBase.find((x) => x.id === id)!;
      expect(f.genotype.loci.A).toEqual(["a^t", "a^t"]);
    }
    const heeler = canineBase.find((x) => x.id === "blue-heeler")!;
    expect(sortedPair(heeler.genotype.loci.R!)).toEqual(["R", "r"]);
  });
});

describe("Portadores ocultos caninos — item 2: fenótipo VISÍVEL idêntico antes/depois (37 novos)", () => {
  it.each(Object.keys(NEW_CARRIERS))("%s: só loci de dominância COMPLETA, alelo do topo + recessivo, expressPhenotype antes === depois", (id) => {
    const f = canineBase.find((x) => x.id === id);
    expect(f, `fundador ${id} não encontrado em founderSeeds()`).toBeDefined();
    const carriers = NEW_CARRIERS[id]!;
    const het = hetLoci(f!.genotype);

    // (1) heterozigose EXATAMENTE nos loci da tabela (nem mais, nem menos), máx. 2.
    expect(Object.keys(het).sort()).toEqual(carriers.map(([l]) => l).sort());
    expect(carriers.length).toBeLessThanOrEqual(2);

    const before: Genotype = structuredClone(f!.genotype);
    for (const [locus, top, carried] of carriers) {
      // (2) só loci de dominância COMPLETA — Cph/Ec/C/F/M/S nunca.
      expect(COMPLETE_LOCI).toContain(locus);
      const def = CANINE_PACK.loci[locus]!;
      expect(def.dominance, `locus ${locus} não é COMPLETE`).toBe("COMPLETE");
      // (3) o alelo original está no TOPO do ranking, acima do portado — por isso o fenótipo não muda.
      expect(def.dominanceRank.indexOf(top), `${id}/${locus}: ${top} precisa dominar ${carried}`).toBeLessThan(def.dominanceRank.indexOf(carried));
      // (4) genótipo real = [topo, recessivo] (ordem indiferente).
      expect(sortedPair(f!.genotype.loci[locus]!)).toEqual(sortedPair([top, carried]));
      // "antes" = o genótipo homozigoto original.
      before.loci[locus] = [top, top];
    }

    const sex = FOUNDER_SEX[id]!;
    const phenoBefore = expressPhenotype(before, CANINE_PACK, sex);
    const phenoNow = expressPhenotype(f!.genotype, CANINE_PACK, sex);
    expect(phenoNow.loci, `fenótipo de ${id} MUDOU — parar e reportar`).toEqual(phenoBefore.loci);
    expect(phenoNow).toEqual(phenoBefore); // viable/epistasis/hasMutation/qtl também idênticos
  });

  it.each(Object.keys(PRE_EXISTING))("%s (pré-existente): heterozigose exata travada — NÃO foi tocado", (id) => {
    const f = canineBase.find((x) => x.id === id)!;
    const het = hetLoci(f.genotype);
    expect(Object.keys(het).sort()).toEqual(Object.keys(PRE_EXISTING[id]!).sort());
    for (const [locus, pair] of Object.entries(PRE_EXISTING[id]!)) expect(sortedPair(het[locus]!)).toEqual(sortedPair(pair));
    expect(expressPhenotype(f.genotype, CANINE_PACK, FOUNDER_SEX[id]!).viable).toBe(true);
  });

  it("gêmeos (sexo oposto) dos 47 continuam cópia PROFUNDA do genótipo do fundador-base", () => {
    for (const base of canineBase) {
      const twinId = FOUNDER_SEX[base.id] === "M" ? `${base.id}-femea` : `${base.id}-macho`;
      const twin = all.find((f) => f.id === twinId);
      expect(twin, `gêmeo ${twinId} não encontrado`).toBeDefined();
      expect(twin!.genotype).toEqual(base.genotype);
      expect(twin!.genotype).not.toBe(base.genotype);
      expect(twin!.sex).not.toBe(base.sex);
    }
  });
});

describe("Portadores ocultos caninos — item 3: segregação real (antes: sempre 1 combinação)", () => {
  const parent = (id: string) => {
    const f = all.find((x) => x.id === id);
    expect(f, `fundador ${id} não encontrado`).toBeDefined();
    return { id: f!.id, genotype: f!.genotype, generation: 0, sex: f!.sex!, species: "canis-familiaris" };
  };
  const ctx = { pack: CANINE_PACK, pedigree: {}, interspecific: false };

  it("dogue-dourado × dogue-tigrado: EXATAMENTE 4 combinações", () => {
    // enumerateOffspring exige parentA=macho, parentB=fêmea: dourado (M) × tigrado (F).
    // Conta locus por locus (16 loci):
    //   B: dourado B/b × tigrado B/b → B/B, B/b, b/b → "preto/roan" (B domina)
    //      ×2 genótipos, "liver/chocolate" (b/b) → 2 saídas.
    //   K: dourado k^y/k^y × tigrado K^br/k^y → K^br/k^y "brindle" ou k^y/k^y
    //      "permite-agouti" → 2 saídas.
    //   D: dourado D/d × tigrado D/D → D/D ou D/d — AMBOS "denso" (D domina;
    //      o portador do dourado fica mascarado pelo tigrado) → 1 saída.
    //   A: A^y/A^y × A^y/A^y → 1. Demais 12 loci: homozigotos no mesmo alelo → 1.
    // Total: B(2) × K(2) = 4.
    const opts = enumerateOffspring(parent("dogue-dourado"), parent("dogue-tigrado"), ctx, 6);
    expect(opts.length).toBe(4);
  });

  it("collie × border-collie: EXATAMENTE 4 combinações", () => {
    // collie (M) × border-collie-femea (F, gêmeo de sexo oposto do base M).
    //   A: collie A^y/a^t × border a/a → A^y/a "fulvo/sable" ou a^t/a
    //      "tan-points" → 2 saídas.
    //   Cl: os DOIS portadores Cl^l/Cl^s → Cl^l/Cl^l e Cl^l/Cl^s ("pelo longo",
    //      3/4) ou Cl^s/Cl^s ("pelo curto", 1/4) → 2 saídas.
    //   B: collie B/B × border B/b → B/B ou B/b — AMBOS "preto/roan" → 1 saída.
    //   Cph: d/d × m/m → sempre Cph^m/Cph^d (heterozigoto fixo) → 1. Ec s/s ×
    //      s/s, S s^p/s^p × s^p/s^p e demais loci: 1 saída cada.
    // Total: A(2) × Cl(2) = 4.
    const opts = enumerateOffspring(parent("collie"), parent("border-collie-femea"), ctx, 6);
    expect(opts.length).toBe(4);
  });

  it("cane-corso × boerboel: EXATAMENTE 4 combinações", () => {
    // cane-corso (M) × boerboel-femea (F, gêmeo de sexo oposto do base M).
    //   K: cane-corso k^y/k^y × boerboel K^br/k^y → K^br/k^y "brindle" ou
    //      k^y/k^y "permite-agouti" → 2 saídas.
    //   A: cane-corso a/a × boerboel A^y/a → A^y/a "fulvo/sable" ou a/a
    //      "não-agouti" (filhote preto) → 2 saídas.
    //   B: cane-corso B/b × boerboel B/B → B/B ou B/b — AMBOS "preto/roan" → 1.
    //   D: cane-corso D/d × boerboel D/D → D/D ou D/d — AMBOS "denso" → 1.
    //   Demais 12 loci: mesmos alelos homozigotos nos dois → 1 saída cada.
    // Total: K(2) × A(2) = 4.
    const opts = enumerateOffspring(parent("cane-corso"), parent("boerboel-femea"), ctx, 6);
    expect(opts.length).toBe(4);
  });
});
