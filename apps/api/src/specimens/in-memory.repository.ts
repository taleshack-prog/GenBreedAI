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

export type PackId = "canine" | "feline";

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

/** Fundadores dos arcos do Gene-Bank (proveniência FOUNDER). Compartilhado. */
export function founderSeeds(): StoredSpecimen[] {
  const base = (
    s: Partial<StoredSpecimen> & { id: string; pack: PackId; species: string; genotype: Genotype },
  ): StoredSpecimen => ({
    ownerId: "demo",
    generation: 0,
    sireId: null,
    damId: null,
    method: "FOUNDER",
    fPedigree: 0,
    fixationIndex: 0,
    aura: 1,
    cacheKey: null,
    ...s,
  });
  return [
    base({ id: "puma", pack: "feline", species: "puma",
      genotype: { loci: { A: ["a", "a"] }, qtl: { porte: 0.6, vigor: 0.6, beleza: 0.5, rosetas: 0.3 } } }),
    base({ id: "negra", pack: "feline", species: "panthera",
      genotype: { loci: { A: ["A", "a"] }, qtl: { porte: 0.7, vigor: 0.6, beleza: 0.6, rosetas: 0.7 } } }),
    { ...base({ id: "delta", pack: "feline", species: "pumajaguar",
      genotype: { loci: { A: ["A", "a"] }, qtl: { porte: 0.65, vigor: 0.6, beleza: 0.55, rosetas: 0.5 } } }),
      generation: 1, sireId: "puma", damId: "negra", method: "F1" },
    base({ id: "golden", pack: "canine", species: "canis",
      genotype: { loci: { F: ["f", "f"], C: ["C", "c^ch"], E: ["E", "E"], K: ["k^y", "k^y"], B: ["B", "B"] }, qtl: { porte: 0.5, vigor: 0.5, beleza: 0.5, temperamento: 0.5 } } }),
    base({ id: "poodle", pack: "canine", species: "canis",
      genotype: { loci: { F: ["F", "F"], C: ["c^ch", "c^ch"], E: ["e", "e"], K: ["k^y", "k^y"], B: ["B", "b"] }, qtl: { porte: 0.5, vigor: 0.5, beleza: 0.5, temperamento: 0.5 } } }),
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
