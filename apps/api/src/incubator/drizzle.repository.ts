/**
 * Adapter Drizzle da porta IncubatorRepository (ADR-0020). Driver-agnóstico
 * (pg → Neon/local, ou PGlite nos testes), mesmo padrão de
 * `specimens/drizzle.repository.ts`.
 */
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { IncubatorRepository, type StoredIncubatorEntry, type PackId } from "./in-memory.repository";
import { incubatorEntries } from "../db/schema";

type Row = typeof incubatorEntries.$inferSelect;

function toStored(r: Row): StoredIncubatorEntry {
  return {
    id: r.id, ownerId: r.ownerId, crossId: r.crossId,
    sireId: r.sireId, damId: r.damId, method: r.method as StoredIncubatorEntry["method"],
    pack: r.pack as PackId, species: r.species,
    genotype: r.genotype, phenotype: r.phenotype,
    prob: r.prob, fPedigree: r.fPedigree, fixationIndex: r.fixationIndex, aura: r.aura,
    generation: r.generation, sex: r.sex as StoredIncubatorEntry["sex"],
    fertility: r.fertility ?? null, haldaneStatus: (r.haldaneStatus as StoredIncubatorEntry["haldaneStatus"]) ?? null,
    imageCacheKey: r.imageCacheKey, revealedAt: r.revealedAt, bornSpecimenId: r.bornSpecimenId,
    frozen: r.frozen, createdAt: r.createdAt,
  };
}

export class DrizzleIncubatorRepository extends IncubatorRepository {
  // `db` é tipado como any para permitir tanto node-postgres quanto PGlite.
  constructor(private readonly db: any) { super(); }

  async create(entry: Omit<StoredIncubatorEntry, "id" | "createdAt" | "imageCacheKey" | "revealedAt" | "bornSpecimenId" | "frozen">): Promise<StoredIncubatorEntry> {
    const id = `incu_${randomUUID()}`;
    const row = {
      id, ownerId: entry.ownerId, crossId: entry.crossId, sireId: entry.sireId, damId: entry.damId,
      method: entry.method, pack: entry.pack, species: entry.species,
      genotype: entry.genotype, phenotype: entry.phenotype, prob: entry.prob,
      fPedigree: entry.fPedigree, fixationIndex: entry.fixationIndex, aura: entry.aura,
      generation: entry.generation, sex: entry.sex, fertility: entry.fertility, haldaneStatus: entry.haldaneStatus,
    };
    const rows: Row[] = await this.db.insert(incubatorEntries).values(row).returning();
    return toStored(rows[0]!);
  }

  async get(id: string): Promise<StoredIncubatorEntry | undefined> {
    const rows: Row[] = await this.db.select().from(incubatorEntries).where(eq(incubatorEntries.id, id));
    return rows[0] ? toStored(rows[0]) : undefined;
  }

  async listByOwner(ownerId: string): Promise<StoredIncubatorEntry[]> {
    const rows: Row[] = await this.db.select().from(incubatorEntries).where(eq(incubatorEntries.ownerId, ownerId));
    return rows.map(toStored);
  }

  /** UPDATE...WHERE revealed_at IS NULL...RETURNING — atômico de verdade no Postgres. */
  async claimReveal(id: string, imageCacheKey: string): Promise<StoredIncubatorEntry | null> {
    const rows: Row[] = await this.db.update(incubatorEntries)
      .set({ revealedAt: new Date(), imageCacheKey })
      .where(and(eq(incubatorEntries.id, id), isNull(incubatorEntries.revealedAt)))
      .returning();
    return rows[0] ? toStored(rows[0]) : null;
  }

  async markFrozen(id: string): Promise<StoredIncubatorEntry | null> {
    const rows: Row[] = await this.db.update(incubatorEntries).set({ frozen: true }).where(eq(incubatorEntries.id, id)).returning();
    return rows[0] ? toStored(rows[0]) : null;
  }

  async markBorn(id: string, specimenId: string): Promise<StoredIncubatorEntry | null> {
    const rows: Row[] = await this.db.update(incubatorEntries).set({ bornSpecimenId: specimenId }).where(eq(incubatorEntries.id, id)).returning();
    return rows[0] ? toStored(rows[0]) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(incubatorEntries).where(eq(incubatorEntries.id, id));
  }
}
