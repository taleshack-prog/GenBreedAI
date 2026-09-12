/**
 * Porta de persistência de espécimes (assíncrona) + adapter in-memory.
 *
 * A porta é `Promise`-based para acomodar I/O de banco (Drizzle/Postgres). O
 * adapter in-memory resolve imediatamente e serve de default para testes sem DB.
 * O adapter Drizzle implementa a MESMA porta (ver drizzle.repository.ts, ADR-0006).
 */

import { Injectable } from "@nestjs/common";
import type { Genotype, Phenotype, BreedingMethod } from "@genbreedai/shared";
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
}

export abstract class SpecimenRepository {
  abstract get(id: string): Promise<StoredSpecimen | undefined>;
  abstract listByOwner(ownerId: string): Promise<StoredSpecimen[]>;
  abstract save(specimen: StoredSpecimen): Promise<StoredSpecimen>;
  /** Monta o pedigree (ancestrais) necessário para o F de Wright. */
  abstract buildPedigree(ids: string[]): Promise<Pedigree>;
}

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
  });
  const R = (x: [string,string]) => x; // helper de legibilidade
  return [
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
    return [...this.store.values()].filter((s) => s.ownerId === ownerId);
  }

  async save(specimen: StoredSpecimen): Promise<StoredSpecimen> {
    const id = specimen.id || `spec_${++this.seq}`;
    const withId = { ...specimen, id };
    this.store.set(id, withId);
    return withId;
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
