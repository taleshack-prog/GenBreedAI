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
  ): Genotype => ({ loci: { A, P, B: ["B","B"], C, D: ["D","D"], W, S: ["s","s"] },
    qtl: { porte: 0.5, vigor: 0.5, beleza: 0.5, rosetas: 0.5, ...q } });
  const can = (
    B: [string, string], K: [string, string], A: [string, string],
    E: [string, string], S: [string, string],
  ): Genotype => ({ loci: { B, K, A, E, S, R: ["r","r"], F: ["f","f"], C: ["C","C"], M: ["m","m"], H: ["h","h"] }, qtl: { porte: 0.5, vigor: 0.5, beleza: 0.5, temperamento: 0.5 } });
  const S = (id: string, species: string, pack: PackId, genotype: Genotype, aura: number): StoredSpecimen => ({
    id, ownerId: "demo", pack, species, genotype, generation: 0,
    sireId: null, damId: null, method: "FOUNDER", fPedigree: 0, fixationIndex: 0, aura, cacheKey: null,
  });
  const R = (x: [string,string]) => x; // helper de legibilidade
  return [
    // ── ONÇAS (Panthera onca) ── rosetas; melanismo segrega intraespécie
    S("onca-pintada", "panthera-onca", "feline", fel(["a","a"], R(["P^r","P^r"]), ["C","C"], ["w","w"], { porte: 0.7, rosetas: 0.85 }), 3),
    S("onca-negra", "panthera-onca", "feline", fel(["A","a"], R(["P^r","P^r"]), ["C","C"], ["w","w"], { porte: 0.72, rosetas: 0.8, beleza: 0.7 }), 4),
    S("onca-pintada-2", "panthera-onca", "feline", fel(["a","a"], R(["P^r","P^r"]), ["C","C"], ["w","w"], { porte: 0.68, rosetas: 0.8 }), 3),
    // ── PUMA / LEÃO ── uniforme (ticked)
    S("puma", "puma", "feline", fel(["a","a"], R(["P^t","P^t"]), ["C","C"], ["w","w"], { porte: 0.65, vigor: 0.7, rosetas: 0.15 }), 2),
    S("leao", "panthera-leo", "feline", fel(["a","a"], R(["P^t","P^t"]), ["C","C"], ["w","w"], { porte: 0.9, vigor: 0.8, rosetas: 0.1 }), 4),
    // ── TIGRES (Panthera tigris) ── listras (mackerel)
    S("tigre-bengala", "panthera-tigris", "feline", fel(["a","a"], R(["P^m","P^m"]), ["C","C"], ["w","w"], { porte: 0.85, vigor: 0.8 }), 4),
    S("tigre-branco", "panthera-tigris-branco", "feline", fel(["a","a"], R(["P^m","P^m"]), ["c^s","c^s"], ["w","w"], { porte: 0.85, beleza: 0.8 }), 5),
    S("tigre-albino", "panthera-tigris-albino", "feline", fel(["a","a"], R(["P^m","P^m"]), ["c","c"], ["w","w"], { porte: 0.82, beleza: 0.75 }), 5),
    // ── LEOPARDO / JAGUATIRICA ── rosetas menores
    S("leopardo", "panthera-pardus", "feline", fel(["a","a"], R(["P^r","P^r"]), ["C","C"], ["w","w"], { porte: 0.6, rosetas: 0.7 }), 3),
    S("jaguatirica", "leopardus-pardalis", "feline", fel(["a","a"], R(["P^r","P^r"]), ["C","C"], ["w","w"], { porte: 0.4, rosetas: 0.7 }), 3),
    // ── GUEPARDO / SERVAL ── pintas (spots)
    S("guepardo", "acinonyx-jubatus", "feline", fel(["a","a"], R(["P^s","P^s"]), ["C","C"], ["w","w"], { porte: 0.6, vigor: 0.85, rosetas: 0.5 }), 4),
    S("serval", "leptailurus-serval", "feline", fel(["a","a"], R(["P^s","P^s"]), ["C","C"], ["w","w"], { porte: 0.45, rosetas: 0.5 }), 3),
    // ── GATO DOMÉSTICO (Felis catus) — espécie-estrela do Free, raças variadas ──
    S("gato-tabby", "felis-catus", "feline", fel(["a","a"], R(["P^m","P^s"]), ["C","C"], ["w","w"], { porte: 0.3 }), 2),
    S("gato-siames", "felis-catus", "feline", fel(["a","a"], R(["P^t","P^m"]), ["c^s","c^s"], ["w","w"], { porte: 0.3, beleza: 0.6 }), 3),
    S("gato-preto", "felis-catus", "feline", fel(["A","A"], R(["P^t","P^t"]), ["C","C"], ["w","w"], { porte: 0.3 }), 2),
    S("gato-branco", "felis-catus", "feline", fel(["a","a"], R(["P^m","P^t"]), ["C","C"], ["W","w"], { porte: 0.3, beleza: 0.55 }), 3),
    // ── CANINOS (Senior) ──
    S("boerboel", "boerboel", "canine", can(["B","B"],["K^br","K^br"],["A^y","A^y"],["E","E"],["S","S"]), 3),
    S("braco-alemao", "braco-alemao", "canine", can(["b","b"],["k^y","k^y"],["a","a"],["E","e"],["s^p","s^p"]), 3),
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
