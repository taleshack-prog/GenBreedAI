/**
 * Adapter Drizzle da porta SpecimenRepository (Fase 1b).
 * Driver-agnóstico: recebe uma instância Drizzle já conectada (pg → Neon/local,
 * ou PGlite nos testes). O mesmo código de query roda nos dois. Ver ADR-0006.
 */

import { inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Pedigree } from "@genbreedai/engine";
import {
  SpecimenRepository,
  type StoredSpecimen,
  type PackId,
} from "./in-memory.repository";
import { specimens } from "../db/schema";

/** Estrutura mínima da instância Drizzle que este repositório usa. */
export interface DrizzleLike {
  select: (...args: unknown[]) => any;
  insert: (...args: unknown[]) => any;
}

type Row = typeof specimens.$inferSelect;

function toStored(r: Row): StoredSpecimen {
  return {
    id: r.id,
    ownerId: r.ownerId,
    pack: r.pack as PackId,
    species: r.species,
    genotype: r.genotype,
    phenotype: r.phenotype ?? undefined,
    generation: r.generation,
    sireId: r.sireId,
    damId: r.damId,
    method: r.method as StoredSpecimen["method"],
    fPedigree: r.fPedigree,
    fixationIndex: r.fixationIndex,
    aura: r.aura,
    cacheKey: r.cacheKey,
    provenanceHash: r.provenanceHash,
    status: (r.status as "ALIVE" | "FROZEN") ?? "ALIVE",
  };
}

export class DrizzleSpecimenRepository extends SpecimenRepository {
  // `db` é tipado como any para permitir tanto node-postgres quanto PGlite.
  constructor(private readonly db: any) {
    super();
  }

  async get(id: string): Promise<StoredSpecimen | undefined> {
    const rows: Row[] = await this.db.select().from(specimens).where(inArray(specimens.id, [id]));
    return rows[0] ? toStored(rows[0]) : undefined;
  }

  async listByOwner(ownerId: string): Promise<StoredSpecimen[]> {
    const rows: Row[] = await this.db
      .select()
      .from(specimens)
      .where(inArray(specimens.ownerId, [ownerId]));
    return rows.map(toStored);
  }

  async save(specimen: StoredSpecimen): Promise<StoredSpecimen> {
    const id = specimen.id || `spec_${randomUUID()}`;
    const row = {
      id,
      ownerId: specimen.ownerId,
      pack: specimen.pack,
      species: specimen.species,
      genotype: specimen.genotype,
      phenotype: specimen.phenotype ?? null,
      generation: specimen.generation,
      sireId: specimen.sireId,
      damId: specimen.damId,
      method: specimen.method,
      fPedigree: specimen.fPedigree,
      fixationIndex: specimen.fixationIndex,
      aura: specimen.aura,
      cacheKey: specimen.cacheKey,
      provenanceHash: specimen.provenanceHash ?? null,
      status: specimen.status ?? "ALIVE",
    };
    await this.db
      .insert(specimens)
      .values(row)
      .onConflictDoUpdate({ target: specimens.id, set: { status: row.status, cacheKey: row.cacheKey, phenotype: row.phenotype } });
    return { ...specimen, id };
  }

  /** Caminha ancestrais em lotes (BFS) até estabilizar o pedigree. */
  async buildPedigree(ids: string[]): Promise<Pedigree> {
    const ped: Pedigree = {};
    let frontier = [...new Set(ids)].filter(Boolean);
    while (frontier.length > 0) {
      const rows: Row[] = await this.db
        .select()
        .from(specimens)
        .where(inArray(specimens.id, frontier));
      const next: string[] = [];
      for (const r of rows) {
        if (ped[r.id]) continue;
        ped[r.id] = { id: r.id, sire: r.sireId, dam: r.damId };
        for (const parent of [r.sireId, r.damId]) {
          if (parent && !ped[parent]) next.push(parent);
        }
      }
      frontier = [...new Set(next)];
    }
    return ped;
  }
}
