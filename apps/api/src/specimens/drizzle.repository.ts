/**
 * Adapter Drizzle da porta SpecimenRepository (Fase 1b).
 * Driver-agnóstico: recebe uma instância Drizzle já conectada (pg → Neon/local,
 * ou PGlite nos testes). O mesmo código de query roda nos dois. Ver ADR-0006.
 */

import { and, eq, inArray } from "drizzle-orm";
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
    sex: (r.sex as StoredSpecimen["sex"]) ?? null,
    fertility: r.fertility ?? null,
    haldaneStatus: (r.haldaneStatus as StoredSpecimen["haldaneStatus"]) ?? null,
    includedPortrait: r.includedPortrait ?? false,
    createdAt: r.createdAt,
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
    // Os fundadores (catálogo base, dono "demo") são visíveis para TODOS os usuários;
    // além deles, o usuário vê os próprios espécimes.
    const owners = ownerId === "demo" ? ["demo"] : [ownerId, "demo"];
    const rows: Row[] = await this.db
      .select()
      .from(specimens)
      .where(inArray(specimens.ownerId, owners));
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
      sex: specimen.sex ?? null,
      fertility: specimen.fertility ?? null,
      haldaneStatus: specimen.haldaneStatus ?? null,
      includedPortrait: specimen.includedPortrait ?? false,
    };
    await this.db
      .insert(specimens)
      .values(row)
      .onConflictDoUpdate({
        target: specimens.id,
        set: {
          status: row.status, cacheKey: row.cacheKey, phenotype: row.phenotype,
          sex: row.sex, fertility: row.fertility, haldaneStatus: row.haldaneStatus,
          // includedPortrait de PROPÓSITO fora deste set: só muda via
          // claimIncludedPortrait (atômico) — um save() por outro motivo
          // nunca deve devolver o "vale" de retrato de graça.
        },
      });
    return { ...specimen, id };
  }

  /**
   * Reivindica o retrato incluído (ADR-0019) — UPDATE...WHERE...RETURNING
   * atômico de verdade no Postgres (não depende de single-thread como o
   * adapter in-memory): só afeta a linha se `included_portrait` ainda for
   * true, e a MESMA query já grava false.
   */
  async claimIncludedPortrait(id: string): Promise<StoredSpecimen | null> {
    const rows: Row[] = await this.db
      .update(specimens)
      .set({ includedPortrait: false })
      .where(and(eq(specimens.id, id), eq(specimens.includedPortrait, true)))
      .returning();
    return rows[0] ? toStored(rows[0]) : null;
  }

  /** Ciclo de vida da incubadora (`incubator-lifecycle.ts`) — 1 query pra todos os ids. */
  async getCreatedAtBatch(ids: string[]): Promise<Map<string, Date>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{ id: string; createdAt: Date }> = await this.db
      .select({ id: specimens.id, createdAt: specimens.createdAt })
      .from(specimens)
      .where(inArray(specimens.id, ids));
    return new Map(rows.map((r) => [r.id, r.createdAt]));
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
