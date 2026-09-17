/**
 * Porta de persistência de espécimes (assíncrona) + adapter in-memory.
 *
 * A porta é `Promise`-based para acomodar I/O de banco (Drizzle/Postgres). O
 * adapter in-memory resolve imediatamente e serve de default para testes sem DB.
 * O adapter Drizzle implementa a MESMA porta (ver drizzle.repository.ts, ADR-0006).
 */

import { Injectable } from "@nestjs/common";
import type { Genotype, Phenotype, BreedingMethod, Sex, FertilityResult } from "@genbreedai/shared";
import type { Pedigree } from "@genbreedai/engine";

export type PackId = "feline" | "canine";

export interface StoredSpecimen {
  id: string;
  ownerId: string;
  pack: PackId;
  species: string;
  genotype: Genotype;
  phenotype?: Phenotype;
  generation: number;
  sireId: string | null;
  damId: string | null;
  method: BreedingMethod | "FOUNDER";
  fPedigree: number;
  fixationIndex: number;
  aura: number;
  cacheKey: string | null;
  provenanceHash?: string | null;
  status?: "ALIVE" | "FROZEN";
  /** Sexo cromossômico (ADR-0013/0015). `null` = legado, sem dado até migração explícita. */
  sex: Sex | null;
  /** Fertilidade [0,100] do PARENTAL no momento do cruzamento (ADR-0015). `null` = legado. */
  fertility: number | null;
  /** Estado de Haldane (ADR-0015) — tipo derivado de FertilityResult, não duplicado. `null` = legado. */
  haldaneStatus: FertilityResult["haldaneStatus"] | null;
  /**
   * Retrato incluído no cruzamento ainda não usado (ADR-0019). OPCIONAL —
   * ausente/undefined é tratado como `false` em todo ponto de leitura
   * (`=== true`, nunca truthy-check solto), pra não exigir atualizar todo
   * literal de `StoredSpecimen` já existente (fundadores, fixtures de
   * teste, preview) só por causa deste campo novo. `true` só quando
   * `CrossService.execute()` cria o espécime; nunca em fundador.
   */
  includedPortrait?: boolean;
}

export abstract class SpecimenRepository {
  abstract get(id: string): Promise<StoredSpecimen | undefined>;
  abstract listByOwner(ownerId: string): Promise<StoredSpecimen[]>;
  abstract save(specimen: StoredSpecimen): Promise<StoredSpecimen>;
  /** Monta o pedigree (ancestrais) necessário para o F de Wright. */
  abstract buildPedigree(ids: string[]): Promise<Pedigree>;
  /**
   * Reivindica o retrato incluído (ADR-0019) — atômico: só some se
   * `includedPortrait` ainda for `true`, e a MESMA chamada já vira `false`;
   * devolve o espécime atualizado, ou `null` se não havia retrato incluído
   * disponível (já usado, ou nunca teve — fundador/legado). Nunca concede
   * duas vezes, mesmo sob chamadas concorrentes.
   */
  abstract claimIncludedPortrait(id: string): Promise<StoredSpecimen | null>;
}

/**
 * Sexo EXPLÍCITO de cada fundador — tabela LITERAL (id → "M"|"F"), sem hash
 * nem regra implícita em runtime; todo fundador tem entrada, nenhum null
 * (ADR-0013/0015 exigem sexo pra cruzar). Critério usado pra preencher esta
 * tabela (decisão fixada aqui, não recalculada em runtime):
 *   - Explícitos: Machos onca-pintada/puma/gato-tabby/tigre-bengala/boerboel;
 *     Fêmeas onca-negra/gato-siames/tigre-branco/braco-alemao (correção de
 *     conflito sire/dam encontrado nos testes de apps/api/test/).
 *   - onca-pintada-2: Fêmea — override explícito (evita reusar onca-pintada,
 *     agora Macho, como dam nos testes puma×onca-pintada; ver correção da
 *     branch atual — NÃO seguiu a alternância por ordem de declaração, que
 *     daria Macho como 3º da espécie "panthera-onca").
 *   - Demais fundadores: alterna M/F na ORDEM DE DECLARAÇÃO abaixo dentro de
 *     cada `species` (campo do catálogo, ex.: as 6 cores de "dogue-alemao"
 *     formam um grupo só); espécie com um único fundador → Macho.
 */
const BASE_FOUNDER_SEX: Record<string, "M" | "F"> = {
  // Panthera onca — onca-pintada(M)/onca-negra(F) explícitos; onca-pintada-2 = F (override, ver acima).
  "onca-pintada": "M", "onca-negra": "F", "onca-pintada-2": "F",
  puma: "M",
  leao: "M",
  "tigre-bengala": "M", "tigre-branco": "F", "tigre-albino": "M",
  leopardo: "M", jaguatirica: "M", guepardo: "M", serval: "M",
  "leopardo-das-neves": "M", lince: "M", caracal: "M",
  // Felis catus — 12 fundadores, alterna M/F na ordem de declaração (gato-tabby/gato-siames explícitos).
  "gato-tabby": "M", "gato-siames": "F", "gato-preto": "M", "gato-branco": "F",
  "gato-maine-coon": "M", "gato-persa": "F", "gato-bengala": "M", "gato-birmania": "F",
  "gato-sphynx": "M", "gato-mau-egipcio": "F", "gato-abissinio": "M", "gato-ragdoll": "F",
  boerboel: "M", "braco-alemao": "F", dobermann: "M",
  // Dogue Alemão — 6 cores, mesma espécie (campo `species`), alterna M/F.
  "dogue-dourado": "M", "dogue-tigrado": "F", "dogue-preto": "M",
  "dogue-azul": "F", "dogue-arlequim": "M", "dogue-manto": "F",
  // Demais raças caninas: 1 fundador por `species` → Macho.
  "pastor-alemao": "M", rottweiler: "M", "sao-bernardo": "M", "dogo-argentino": "M",
  "mastim-ingles": "M", collie: "M", "border-collie": "M", "bulldog-frances": "M", greyhound: "M",
  "presa-canaria": "M", "cane-corso": "M", "mastim-napolitano": "M", "bull-mastiff": "M",
  kangal: "M", alabai: "M", "pastor-caucaso": "M", "mastim-tibetano": "M", cimarron: "M",
  "terra-nova": "M", "pastor-belga-malinois": "M", "pastor-belga-groenendael": "M",
  "pastor-serra-estrela": "M", "pastor-pampeano": "M", "old-english-sheepdog": "M",
  "australian-shepherd": "M", "blue-heeler": "M", "pastor-shetland": "M", "pit-bull": "M",
  "terrier-brasileiro": "M", "terrier-anao-branco": "M", "bulldog-ingles": "M",
  "bulldog-americano": "M", "buldogue-campeiro": "M", "spitz-alemao": "M",
  "irish-wolfhound": "M", whippet: "M", saluki: "M", "afghan-hound": "M",
};

/**
 * Sexo por id — cobre os 74 fundadores-base (`BASE_FOUNDER_SEX` acima) E os
 * respectivos GÊMEOS de sexo oposto ("todo fundador tem casal", ver
 * `founderSeeds()`). Os gêmeos NÃO são digitados aqui um a um — são
 * DERIVADOS por código a partir de `BASE_FOUNDER_SEX`: id `${baseId}-femea`
 * (se o base é Macho) ou `${baseId}-macho` (se o base é Fêmea), sexo oposto
 * ao do fundador-base.
 */
export const FOUNDER_SEX: Record<string, "M" | "F"> = Object.fromEntries(
  Object.entries(BASE_FOUNDER_SEX).flatMap(([id, sex]) => {
    const twinId = sex === "M" ? `${id}-femea` : `${id}-macho`;
    const twinSex: "M" | "F" = sex === "M" ? "F" : "M";
    return [[id, sex] as const, [twinId, twinSex] as const];
  }),
);

/** Fundadores — CATÁLOGO FELINO (Free intraespécie) + caninos (Senior). TDD §6 + felinos-genetica.md */
export function founderSeeds(): StoredSpecimen[] {
  // Genótipo felino: A(melanismo) P(padrão) B(cor) C(albino) D(diluição) W(branco) S(manchas).
  const fel = (
    A: [string, string], P: [string, string], C: [string, string] = ["C","C"],
    W: [string, string] = ["w","w"], q: Record<string, number> = {},
    Ma: [string, string] = ["ma","ma"],
    Bd: [string, string] = ["Bd^d","Bd^d"], He: [string, string] = ["He^r","He^r"], Ec: [string, string] = ["Ec^n","Ec^n"],
    Fl: [string, string] = ["Fl^s","Fl^s"], Hr: [string, string] = ["Hr","Hr"], S: [string, string] = ["s","s"],
  ): Genotype => ({ loci: { A, P, B: ["B","B"], C, D: ["D","D"], W, S, Ma, Bd, He, Ec, Fl, Hr },
    qtl: { porte: 0.5, vigor: 0.5, beleza: 0.5, rosetas: 0.5, ...q } });
  // Genótipo canino com morfologia + porte (ADR-0011).
  const dog = (o: {
    B?: [string,string]; K?: [string,string]; A?: [string,string]; E?: [string,string]; S?: [string,string]; R?: [string,string];
    M?: [string,string]; H?: [string,string]; D?: [string,string];
    Cph: [string,string]; Ec: [string,string]; Cl: [string,string]; Ct?: [string,string]; Tl?: [string,string];
    porte: number; vigor?: number;
  }): Genotype => ({
    loci: {
      B: o.B ?? ["B","B"], K: o.K ?? ["k^y","k^y"], A: o.A ?? ["A^y","A^y"], E: o.E ?? ["E","E"],
      S: o.S ?? ["S","S"], R: o.R ?? ["r","r"], F: ["f","f"], C: ["C","C"], M: o.M ?? ["m","m"], H: o.H ?? ["h","h"], D: o.D ?? ["D","D"],
      Cph: o.Cph, Ec: o.Ec, Cl: o.Cl, Ct: o.Ct ?? ["Ct^n","Ct^n"], Tl: o.Tl ?? ["Tl^l","Tl^l"],
    },
    qtl: { porte: o.porte, vigor: o.vigor ?? 0.6, beleza: 0.5, temperamento: 0.5 },
  });

  const S = (id: string, species: string, pack: PackId, genotype: Genotype, aura: number): StoredSpecimen => ({
    id, ownerId: "demo", pack, species, genotype, generation: 0,
    sireId: null, damId: null, method: "FOUNDER", fPedigree: 0, fixationIndex: 0, aura, cacheKey: null,
    // Sexo EXPLÍCITO por tabela literal (FOUNDER_SEX, abaixo) — nenhum
    // fundador fica null; o motor exige sexo pra cruzar (ADR-0013/0015).
    // fertility/haldaneStatus continuam null: não são calculados para
    // fundador (não nasceram de um cruzamento) — só a migração de dados real
    // (dry-run primeiro) preencheria isso, se algum dia fizer sentido.
    sex: FOUNDER_SEX[id]!, fertility: null, haldaneStatus: null,
    // Fundador nunca teve "cruzamento" nenhum — sem retrato incluído (ADR-0019).
    includedPortrait: false,
  });
  const R = (x: [string,string]) => x; // helper de legibilidade
  const base: StoredSpecimen[] = [
    // ── ONÇAS (Panthera onca) ── rosetas; melanismo segrega intraespécie
    S("onca-pintada", "panthera-onca", "feline", { loci: { A:["a","a"], P:["P^r","P^r"], B:["B","B"], C:["C","c^b"], D:["D","D"], W:["w","w"], S:["s","s"], Ma:["ma","ma"], Bd:["Bd^a","Bd^a"], He:["He^b","He^b"], Ec:["Ec^n","Ec^n"], Fl:["Fl^s","Fl^s"], Hr:["Hr","Hr"] }, qtl: { porte: 0.78, vigor: 0.75, beleza: 0.5, rosetas: 0.85 } }, 3),
    S("onca-negra", "panthera-onca", "feline", fel(["A","a"], R(["P^r","P^r"]), ["C","C"], ["w","w"], { porte: 0.78, vigor: 0.75, rosetas: 0.8, beleza: 0.7 }, ["ma","ma"], ["Bd^a","Bd^a"], ["He^b","He^b"], ["Ec^n","Ec^n"]), 4),
    S("onca-pintada-2", "panthera-onca", "feline", fel(["a","a"], R(["P^r","P^r"]), ["C","C"], ["w","w"], { porte: 0.68, rosetas: 0.8 }), 3),
    // ── PUMA / LEÃO ── uniforme (ticked)
    S("puma", "puma", "feline", fel(["a","a"], R(["P^t","P^t"]), ["C","C"], ["w","w"], { porte: 0.72, vigor: 0.8, rosetas: 0.05 }, ["ma","ma"], ["Bd^s","Bd^s"], ["He^r","He^r"], ["Ec^n","Ec^n"]), 2),
    S("leao", "panthera-leo", "feline", { loci: { A:["a","a"], P:["P^t","P^t"], B:["B","B"], C:["C","c^s"], D:["D","D"], W:["w","w"], S:["s","s"], Ma:["Ma","Ma"], Bd:["Bd^a","Bd^a"], He:["He^b","He^b"], Ec:["Ec^n","Ec^n"], Fl:["Fl^s","Fl^s"], Hr:["Hr","Hr"] }, qtl: { porte: 0.95, vigor: 0.9, beleza: 0.5, rosetas: 0.05 } }, 4),
    // ── TIGRES (Panthera tigris) ── listras (mackerel)
    S("tigre-bengala", "panthera-tigris", "feline", fel(["a","a"], R(["P^m","P^m"]), ["C","C"], ["w","w"], { porte: 0.92, vigor: 0.88 }, ["ma","ma"], ["Bd^d","Bd^d"], ["He^b","He^b"], ["Ec^n","Ec^n"]), 4),
    S("tigre-branco", "panthera-tigris-branco", "feline", fel(["a","a"], R(["P^m","P^m"]), ["c^s","c^s"], ["w","w"], { porte: 0.9, vigor: 0.85, beleza: 0.8 }, ["ma","ma"], ["Bd^d","Bd^d"], ["He^b","He^b"], ["Ec^n","Ec^n"]), 5),
    S("tigre-albino", "panthera-tigris-albino", "feline", fel(["a","a"], R(["P^m","P^m"]), ["c","c"], ["w","w"], { porte: 0.9, vigor: 0.85, beleza: 0.75 }, ["ma","ma"], ["Bd^d","Bd^d"], ["He^b","He^b"], ["Ec^n","Ec^n"]), 5),
    // ── LEOPARDO / JAGUATIRICA ── rosetas menores
    S("leopardo", "panthera-pardus", "feline", fel(["a","a"], R(["P^r","P^r"]), ["C","C"], ["w","w"], { porte: 0.58, vigor: 0.65, rosetas: 0.7 }, ["ma","ma"], ["Bd^d","Bd^d"], ["He^a","He^a"], ["Ec^n","Ec^n"]), 3),
    S("jaguatirica", "leopardus-pardalis", "feline", fel(["a","a"], R(["P^r","P^r"]), ["C","C"], ["w","w"], { porte: 0.3, vigor: 0.5, rosetas: 0.7 }, ["ma","ma"], ["Bd^d","Bd^d"], ["He^r","He^r"], ["Ec^n","Ec^n"]), 3),
    // ── GUEPARDO / SERVAL ── pintas (spots)
    S("guepardo", "acinonyx-jubatus", "feline", fel(["a","a"], R(["P^s","P^s"]), ["C","C"], ["w","w"], { porte: 0.55, vigor: 0.9, rosetas: 0.5 }, ["ma","ma"], ["Bd^s","Bd^s"], ["He^r","He^r"], ["Ec^n","Ec^n"]), 4),
    S("serval", "leptailurus-serval", "feline", fel(["a","a"], R(["P^s","P^s"]), ["C","C"], ["w","w"], { porte: 0.4, vigor: 0.6, rosetas: 0.5 }, ["ma","ma"], ["Bd^s","Bd^s"], ["He^a","He^a"], ["Ec^l","Ec^l"]), 3),
    // ── NOVOS FELINOS SELVAGENS (orelhas tufadas, pelo longo, cores distintas) ──
    S("leopardo-das-neves", "panthera-uncia", "feline", fel(["a","a"], R(["P^r","P^r"]), ["C","C"], ["w","w"], { porte: 0.72, vigor: 0.7, beleza: 0.85, rosetas: 0.8 }, ["ma","ma"], ["Bd^g","Bd^g"], ["He^b","He^b"], ["Ec^n","Ec^n"], ["Fl^l","Fl^l"]), 5),
    S("lince", "lynx-lynx", "feline", fel(["a","a"], R(["P^s","P^s"]), ["C","C"], ["w","w"], { porte: 0.5, vigor: 0.65, rosetas: 0.5 }, ["ma","ma"], ["Bd^s","Bd^s"], ["He^a","He^a"], ["Ec^t","Ec^t"], ["Fl^s","Fl^s"]), 4),
    S("caracal", "caracal", "feline", fel(["a","a"], R(["P^t","P^t"]), ["C","C"], ["w","w"], { porte: 0.5, vigor: 0.7, rosetas: 0.05 }, ["ma","ma"], ["Bd^a","Bd^a"], ["He^a","He^a"], ["Ec^t","Ec^t"], ["Fl^s","Fl^s"]), 4),
    // ── GATO DOMÉSTICO (Felis catus) — espécie-estrela do Free, raças variadas ──
    // ── GATO DOMÉSTICO (Felis catus) — raças com genótipo fiel ──
    // fel(A,P,C,W,q,Ma,Bd,He,Ec,Fl,Hr,S)
    S("gato-tabby", "felis-catus", "feline", fel(["a","a"], R(["P^m","P^m"]), ["C","C"], ["w","w"], { porte: 0.24, vigor: 0.42 }, ["ma","ma"], ["Bd^d","Bd^d"], ["He^r","He^r"], ["Ec^n","Ec^n"], ["Fl^s","Fl^s"]), 2),
    S("gato-siames", "felis-catus", "feline", fel(["a","a"], R(["P^t","P^t"]), ["c^s","c^s"], ["w","w"], { porte: 0.2, vigor: 0.4, beleza: 0.6 }, ["ma","ma"], ["Bd^s","Bd^s"], ["He^a","He^a"], ["Ec^n","Ec^n"], ["Fl^s","Fl^s"]), 3),
    S("gato-preto", "felis-catus", "feline", fel(["A","A"], R(["P^t","P^t"]), ["C","C"], ["w","w"], { porte: 0.24, vigor: 0.45 }, ["ma","ma"], ["Bd^g","Bd^g"], ["He^r","He^r"], ["Ec^n","Ec^n"], ["Fl^s","Fl^s"]), 2),
    S("gato-branco", "felis-catus", "feline", fel(["a","a"], R(["P^t","P^t"]), ["C","C"], ["W","w"], { porte: 0.24, vigor: 0.4, beleza: 0.55 }, ["ma","ma"], ["Bd^s","Bd^s"], ["He^r","He^r"], ["Ec^n","Ec^n"], ["Fl^s","Fl^s"]), 3),
    S("gato-maine-coon", "felis-catus", "feline", fel(["a","a"], R(["P^m","P^m"]), ["C","C"], ["w","w"], { porte: 0.5, vigor: 0.6, beleza: 0.65 }, ["ma","ma"], ["Bd^d","Bd^d"], ["He^b","He^b"], ["Ec^t","Ec^t"], ["Fl^l","Fl^l"]), 4),
    S("gato-persa", "felis-catus", "feline", fel(["a","a"], R(["P^t","P^t"]), ["C","C"], ["w","w"], { porte: 0.3, vigor: 0.3, beleza: 0.75 }, ["ma","ma"], ["Bd^s","Bd^s"], ["He^r","He^r"], ["Ec^n","Ec^n"], ["Fl^l","Fl^l"]), 4),
    S("gato-bengala", "felis-catus", "feline", fel(["a","a"], R(["P^s","P^s"]), ["C","C"], ["w","w"], { porte: 0.32, vigor: 0.65, rosetas: 0.7 }, ["ma","ma"], ["Bd^d","Bd^d"], ["He^r","He^r"], ["Ec^n","Ec^n"], ["Fl^s","Fl^s"]), 3),
    S("gato-birmania", "felis-catus", "feline", fel(["a","a"], R(["P^t","P^t"]), ["c^s","c^s"], ["w","w"], { porte: 0.3, vigor: 0.4, beleza: 0.7 }, ["ma","ma"], ["Bd^d","Bd^d"], ["He^r","He^r"], ["Ec^n","Ec^n"], ["Fl^l","Fl^l"], ["Hr","Hr"], ["S","s"]), 4),
    S("gato-sphynx", "felis-catus", "feline", fel(["a","a"], R(["P^t","P^t"]), ["C","C"], ["w","w"], { porte: 0.26, vigor: 0.45, beleza: 0.5 }, ["ma","ma"], ["Bd^s","Bd^s"], ["He^a","He^a"], ["Ec^l","Ec^l"], ["Fl^s","Fl^s"], ["hr","hr"]), 4),
    S("gato-mau-egipcio", "felis-catus", "feline", fel(["a","a"], R(["P^s","P^s"]), ["C","C"], ["w","w"], { porte: 0.28, vigor: 0.55, rosetas: 0.6 }, ["ma","ma"], ["Bd^g","Bd^g"], ["He^a","He^a"], ["Ec^n","Ec^n"], ["Fl^s","Fl^s"]), 4),
    S("gato-abissinio", "felis-catus", "feline", fel(["a","a"], R(["P^t","P^t"]), ["C","C"], ["w","w"], { porte: 0.28, vigor: 0.6 }, ["ma","ma"], ["Bd^a","Bd^a"], ["He^a","He^a"], ["Ec^n","Ec^n"], ["Fl^s","Fl^s"]), 3),
    S("gato-ragdoll", "felis-catus", "feline", fel(["a","a"], R(["P^t","P^t"]), ["c^s","c^s"], ["w","w"], { porte: 0.4, vigor: 0.45, beleza: 0.7 }, ["ma","ma"], ["Bd^s","Bd^s"], ["He^b","He^b"], ["Ec^n","Ec^n"], ["Fl^l","Fl^l"], ["Hr","Hr"], ["S","s"]), 4),
    // ── CANINOS (Senior) — Onda 1: 12 raças icônicas ──
    // dog({B,K,A,E,S,R,M,H, Cph,Ec,Cl,Ct,Tl, porte,vigor})
    S("boerboel", "boerboel", "canine", dog({ B:["B","B"], K:["K^br","K^br"], A:["A^y","A^y"], S:["S","S"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.8, vigor:0.85 }), 3),
    S("braco-alemao", "braco-alemao", "canine", dog({ B:["b","b"], K:["k^y","k^y"], A:["a","a"], E:["E","e"], S:["s^p","s^p"], R:["R","R"], Cph:["Cph^d","Cph^d"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.55, vigor:0.7 }), 3),
    S("dobermann", "dobermann", "canine", dog({ B:["B","b"], K:["k^y","k^y"], A:["a^t","a^t"], D:["D","d"], S:["S","S"], Cph:["Cph^d","Cph^d"], Ec:["Ec^e","Ec^e"], Cl:["Cl^s","Cl^s"], porte:0.7, vigor:0.8 }), 4),
    // Dogue Alemão — 6 cores (todas Cph^m, Ec^s, gigantes)
    S("dogue-dourado", "dogue-alemao", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["A^y","A^y"], S:["S","S"], Cph:["Cph^m","Cph^m"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], porte:0.95, vigor:0.8 }), 4),
    S("dogue-tigrado", "dogue-alemao", "canine", dog({ B:["B","B"], K:["K^br","K^br"], A:["A^y","A^y"], S:["S","S"], Cph:["Cph^m","Cph^m"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], porte:0.95, vigor:0.8 }), 4),
    S("dogue-preto", "dogue-alemao", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["a","a"], S:["S","S"], Cph:["Cph^m","Cph^m"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], porte:0.95, vigor:0.8 }), 4),
    S("dogue-azul", "dogue-alemao", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["a","a"], D:["d","d"], S:["S","S"], Cph:["Cph^m","Cph^m"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], porte:0.95, vigor:0.8 }), 5),
    S("dogue-arlequim", "dogue-alemao", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["a","a"], M:["M","m"], H:["H","h"], S:["S","S"], Cph:["Cph^m","Cph^m"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], porte:0.95, vigor:0.8 }), 5),
    S("dogue-manto", "dogue-alemao", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["a","a"], S:["s^p","s^p"], Cph:["Cph^m","Cph^m"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], porte:0.95, vigor:0.8 }), 5),
    S("pastor-alemao", "pastor-alemao", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["a^t","a^t"], S:["S","S"], Cph:["Cph^m","Cph^m"], Ec:["Ec^e","Ec^e"], Cl:["Cl^l","Cl^s"], porte:0.7, vigor:0.78 }), 4),
    S("rottweiler", "rottweiler", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["a^t","a^t"], S:["S","S"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.78, vigor:0.9 }), 4),
    S("sao-bernardo", "sao-bernardo", "canine", dog({ B:["b","b"], K:["k^y","k^y"], A:["A^y","A^y"], S:["s^p","s^p"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^l","Cl^l"], porte:0.95, vigor:0.75 }), 5),
    S("dogo-argentino", "dogo-argentino", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["A^y","A^y"], E:["e","e"], S:["S","S"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.75, vigor:0.85 }), 4),
    S("mastim-ingles", "mastim-ingles", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["A^y","A^y"], S:["S","S"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.98, vigor:0.85 }), 5),
    S("collie", "collie", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["A^y","A^y"], S:["s^p","s^p"], Cph:["Cph^d","Cph^d"], Ec:["Ec^s","Ec^s"], Cl:["Cl^l","Cl^l"], porte:0.6, vigor:0.6 }), 4),
    S("border-collie", "border-collie", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["a","a"], S:["s^p","s^p"], Cph:["Cph^m","Cph^m"], Ec:["Ec^s","Ec^s"], Cl:["Cl^l","Cl^l"], porte:0.5, vigor:0.7 }), 4),
    S("bulldog-frances", "bulldog-frances", "canine", dog({ B:["B","B"], K:["K^br","K^br"], A:["A^y","A^y"], S:["S","S"], Cph:["Cph^b","Cph^b"], Ec:["Ec^e","Ec^e"], Cl:["Cl^s","Cl^s"], Tl:["Tl^b","Tl^b"], porte:0.3, vigor:0.55 }), 3),
    S("greyhound", "greyhound", "canine", dog({ B:["B","B"], K:["k^y","k^y"], A:["A^y","A^y"], S:["S","S"], Cph:["Cph^d","Cph^d"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], porte:0.6, vigor:0.7 }), 4),
    // ── ONDA 2 — molossos, pastores, sighthounds, spitz, bulldogs, terriers, BR ──
    S("presa-canaria", "presa-canaria", "canine", dog({ K:["K^br","k^y"], A:["A^y","A^y"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.78, vigor:0.85 }), 4),
    S("cane-corso", "cane-corso", "canine", dog({ A:["a","a"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.75, vigor:0.85 }), 4),
    S("mastim-napolitano", "mastim-napolitano", "canine", dog({ A:["a","a"], D:["d","d"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.9, vigor:0.75 }), 5),
    S("bull-mastiff", "bull-mastiff", "canine", dog({ A:["A^y","A^y"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.85, vigor:0.85 }), 4),
    S("kangal", "kangal", "canine", dog({ A:["A^y","A^y"], Cph:["Cph^m","Cph^m"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], Tl:["Tl^c","Tl^c"], porte:0.82, vigor:0.85 }), 4),
    S("alabai", "alabai", "canine", dog({ A:["A^y","A^y"], S:["S","S"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.9, vigor:0.85 }), 5),
    S("pastor-caucaso", "pastor-caucaso", "canine", dog({ A:["A^y","A^y"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^l","Cl^l"], porte:0.9, vigor:0.8 }), 5),
    S("mastim-tibetano", "mastim-tibetano", "canine", dog({ A:["a^t","a^t"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^l","Cl^l"], Tl:["Tl^c","Tl^c"], porte:0.85, vigor:0.8 }), 5),
    S("cimarron", "cimarron", "canine", dog({ K:["K^br","k^y"], A:["A^y","A^y"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.6, vigor:0.8 }), 4),
    S("terra-nova", "terra-nova", "canine", dog({ A:["a","a"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^l","Cl^l"], porte:0.9, vigor:0.75 }), 5),
    S("pastor-belga-malinois", "pastor-belga-malinois", "canine", dog({ A:["A^y","A^y"], Cph:["Cph^d","Cph^d"], Ec:["Ec^e","Ec^e"], Cl:["Cl^s","Cl^s"], porte:0.6, vigor:0.85 }), 4),
    S("pastor-belga-groenendael", "pastor-belga-groenendael", "canine", dog({ A:["a","a"], Cph:["Cph^m","Cph^m"], Ec:["Ec^e","Ec^e"], Cl:["Cl^l","Cl^l"], porte:0.6, vigor:0.75 }), 4),
    S("pastor-serra-estrela", "pastor-serra-estrela", "canine", dog({ A:["A^y","A^y"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^l","Cl^l"], Tl:["Tl^c","Tl^c"], porte:0.7, vigor:0.75 }), 4),
    S("pastor-pampeano", "pastor-pampeano", "canine", dog({ A:["A^y","A^y"], S:["s^p","s^p"], Cph:["Cph^m","Cph^m"], Ec:["Ec^d","Ec^d"], Cl:["Cl^l","Cl^s"], porte:0.6, vigor:0.7 }), 3),
    S("old-english-sheepdog", "old-english-sheepdog", "canine", dog({ A:["a","a"], D:["d","d"], S:["s^p","s^p"], Cph:["Cph^m","Cph^m"], Ec:["Ec^d","Ec^d"], Cl:["Cl^l","Cl^l"], Tl:["Tl^b","Tl^b"], porte:0.7, vigor:0.65 }), 4),
    S("australian-shepherd", "australian-shepherd", "canine", dog({ A:["a^t","a^t"], M:["M","m"], S:["s^p","s^p"], Cph:["Cph^m","Cph^m"], Ec:["Ec^s","Ec^s"], Cl:["Cl^l","Cl^s"], porte:0.5, vigor:0.75 }), 4),
    S("blue-heeler", "blue-heeler", "canine", dog({ A:["a^t","a^t"], R:["R","R"], Cph:["Cph^m","Cph^m"], Ec:["Ec^e","Ec^e"], Cl:["Cl^s","Cl^s"], porte:0.5, vigor:0.9 }), 4),
    S("pastor-shetland", "pastor-shetland", "canine", dog({ A:["A^y","A^y"], S:["s^p","s^p"], Cph:["Cph^d","Cph^d"], Ec:["Ec^s","Ec^s"], Cl:["Cl^l","Cl^l"], porte:0.35, vigor:0.6 }), 4),
    S("pit-bull", "pit-bull", "canine", dog({ K:["K^br","k^y"], A:["A^y","A^y"], Cph:["Cph^m","Cph^m"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], porte:0.5, vigor:0.85 }), 4),
    S("terrier-brasileiro", "terrier-brasileiro", "canine", dog({ A:["a^t","a^t"], S:["s^p","s^p"], Cph:["Cph^m","Cph^m"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], porte:0.3, vigor:0.65 }), 3),
    S("terrier-anao-branco", "terrier-anao-branco", "canine", dog({ A:["A^y","A^y"], S:["s^p","s^p"], Cph:["Cph^m","Cph^m"], Ec:["Ec^e","Ec^e"], Cl:["Cl^s","Cl^s"], porte:0.2, vigor:0.55 }), 3),
    S("bulldog-ingles", "bulldog-ingles", "canine", dog({ K:["K^br","k^y"], A:["A^y","A^y"], S:["s^p","s^p"], Cph:["Cph^b","Cph^b"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], Tl:["Tl^b","Tl^b"], porte:0.4, vigor:0.55 }), 4),
    S("bulldog-americano", "bulldog-americano", "canine", dog({ A:["A^y","A^y"], S:["s^p","s^p"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.6, vigor:0.85 }), 4),
    S("buldogue-campeiro", "buldogue-campeiro", "canine", dog({ A:["A^y","A^y"], S:["s^p","s^p"], Cph:["Cph^b","Cph^b"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.6, vigor:0.8 }), 3),
    S("spitz-alemao", "spitz-alemao", "canine", dog({ A:["A^y","A^y"], Cph:["Cph^m","Cph^m"], Ec:["Ec^e","Ec^e"], Cl:["Cl^l","Cl^l"], Tl:["Tl^c","Tl^c"], porte:0.18, vigor:0.5 }), 3),
    S("irish-wolfhound", "irish-wolfhound", "canine", dog({ K:["k^y","k^y"], A:["A^y","A^y"], D:["d","d"], Cph:["Cph^d","Cph^d"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], Ct:["Ct^w","Ct^w"], porte:0.92, vigor:0.7 }), 5),
    S("whippet", "whippet", "canine", dog({ A:["A^y","A^y"], Cph:["Cph^d","Cph^d"], Ec:["Ec^s","Ec^s"], Cl:["Cl^s","Cl^s"], porte:0.45, vigor:0.7 }), 3),
    S("saluki", "saluki", "canine", dog({ A:["A^y","A^y"], Cph:["Cph^d","Cph^d"], Ec:["Ec^d","Ec^d"], Cl:["Cl^s","Cl^s"], porte:0.6, vigor:0.7 }), 4),
    S("afghan-hound", "afghan-hound", "canine", dog({ A:["A^y","A^y"], Cph:["Cph^d","Cph^d"], Ec:["Ec^d","Ec^d"], Cl:["Cl^l","Cl^l"], Tl:["Tl^c","Tl^c"], porte:0.6, vigor:0.65 }), 5),
  ];
  // DECISÃO: "todo fundador tem casal" — gera, POR CÓDIGO (não 74 entradas
  // literais novas), um gêmeo de sexo OPOSTO pra cada fundador-base: mesmo
  // pack/species/generation/method/aura e demais campos; genotype em CÓPIA
  // PROFUNDA (structuredClone — nunca compartilha os arrays de alelos com o
  // original); fertility/haldaneStatus null (mesma regra de fundador, não
  // nasceu de cruzamento). id = `${id}-femea` (base Macho) / `${id}-macho`
  // (base Fêmea).
  const twins: StoredSpecimen[] = base.map((f) => {
    const twinId = f.sex === "M" ? `${f.id}-femea` : `${f.id}-macho`;
    if (base.some((b) => b.id === twinId)) {
      throw new Error(`founderSeeds: id de gêmeo "${twinId}" colide com um fundador já existente.`);
    }
    return {
      ...f,
      id: twinId,
      genotype: structuredClone(f.genotype),
      sex: f.sex === "M" ? "F" : "M",
      fertility: null,
      haldaneStatus: null,
    };
  });
  return [...base, ...twins];
}

@Injectable()
export class InMemorySpecimenRepository extends SpecimenRepository {
  private readonly store = new Map<string, StoredSpecimen>();
  private seq = 0;

  constructor() {
    super();
    for (const f of founderSeeds()) this.store.set(f.id, f);
  }

  async get(id: string): Promise<StoredSpecimen | undefined> {
    return this.store.get(id);
  }

  async listByOwner(ownerId: string): Promise<StoredSpecimen[]> {
    // Fundadores (dono "demo") visíveis p/ todos + espécimes próprios.
    const owners = ownerId === "demo" ? ["demo"] : [ownerId, "demo"];
    return [...this.store.values()].filter((s) => owners.includes(s.ownerId));
  }

  async save(specimen: StoredSpecimen): Promise<StoredSpecimen> {
    const id = specimen.id || `spec_${++this.seq}`;
    const withId = { ...specimen, id };
    this.store.set(id, withId);
    return withId;
  }

  /** Atômico (JS single-thread: sem `await` entre ler e escrever, nada mais roda no meio). */
  async claimIncludedPortrait(id: string): Promise<StoredSpecimen | null> {
    const s = this.store.get(id);
    if (!s || s.includedPortrait !== true) return null;
    const updated: StoredSpecimen = { ...s, includedPortrait: false };
    this.store.set(id, updated);
    return updated;
  }

  async buildPedigree(ids: string[]): Promise<Pedigree> {
    const ped: Pedigree = {};
    const visit = (id: string | null) => {
      if (id === null || ped[id]) return;
      const s = this.store.get(id);
      if (!s) return;
      ped[id] = { id, sire: s.sireId, dam: s.damId };
      visit(s.sireId);
      visit(s.damId);
    };
    for (const id of ids) visit(id);
    return ped;
  }
}
