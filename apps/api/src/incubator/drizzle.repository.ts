/**
 * Adapter Drizzle da porta IncubatorRepository (ADR-0020, gestação ADR-0021,
 * paginação ADR-0021 item 2 desta rodada). Driver-agnóstico (pg → Neon/
 * local, ou PGlite nos testes), mesmo padrão de `specimens/drizzle.
 * repository.ts`.
 */
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  IncubatorRepository, type StoredIncubatorEntry, type PackId,
  type IncubatorListOptions, type IncubatorListResult, type IncubatorStateCounts, type IncubatorState,
} from "./in-memory.repository";
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
    gestationStartedAt: r.gestationStartedAt, gestationEndsAt: r.gestationEndsAt, bornSpecimenId: r.bornSpecimenId,
    frozen: r.frozen, createdAt: r.createdAt,
  };
}

/** Mesma definição de estado que `incubatorStateOf()` (in-memory) — em SQL, pra filtrar/contar sem trazer tudo pra memória. */
function stateCondition(state: IncubatorState, now: Date) {
  switch (state) {
    case "NA_INCUBADORA":
      return and(isNull(incubatorEntries.gestationStartedAt), isNull(incubatorEntries.bornSpecimenId));
    case "GESTANDO":
      return and(isNotNull(incubatorEntries.gestationStartedAt), isNull(incubatorEntries.bornSpecimenId), gt(incubatorEntries.gestationEndsAt, now));
    case "PRONTO":
      return and(isNotNull(incubatorEntries.gestationStartedAt), isNull(incubatorEntries.bornSpecimenId), lte(incubatorEntries.gestationEndsAt, now));
    case "NASCIDO":
      return isNotNull(incubatorEntries.bornSpecimenId);
  }
}

const ALL_STATES: IncubatorState[] = ["NA_INCUBADORA", "GESTANDO", "PRONTO", "NASCIDO"];

export class DrizzleIncubatorRepository extends IncubatorRepository {
  // `db` é tipado como any para permitir tanto node-postgres quanto PGlite.
  constructor(private readonly db: any) { super(); }

  async create(entry: Omit<StoredIncubatorEntry, "id" | "createdAt" | "gestationStartedAt" | "gestationEndsAt" | "bornSpecimenId" | "frozen">): Promise<StoredIncubatorEntry> {
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

  /**
   * Paginação por keyset (created_at, id), os dois DESC — não por OFFSET
   * (OFFSET degrada com o tamanho da tabela e pode pular/repetir linha se
   * alguém descartar uma entrada entre duas páginas; keyset não tem esse
   * problema). Busca `limit + 1` linhas pra saber se há próxima página sem
   * precisar de um COUNT(*) à parte.
   */
  async listByOwner(ownerId: string, opts: IncubatorListOptions): Promise<IncubatorListResult> {
    const conditions = [eq(incubatorEntries.ownerId, ownerId)];
    if (opts.state) conditions.push(stateCondition(opts.state, opts.now)!);

    if (opts.cursor) {
      const cursorRows: Row[] = await this.db.select().from(incubatorEntries).where(eq(incubatorEntries.id, opts.cursor));
      const cursorRow = cursorRows[0];
      // Cursor não existe mais (entrada descartada entre páginas) — página
      // vazia, nunca reinicia do topo (evitaria repetir entradas já vistas
      // pelo cliente) — mesma regra do adapter in-memory.
      if (!cursorRow) return { entries: [], nextCursor: null };
      conditions.push(
        or(
          lt(incubatorEntries.createdAt, cursorRow.createdAt),
          and(eq(incubatorEntries.createdAt, cursorRow.createdAt), lt(incubatorEntries.id, cursorRow.id)),
        )!,
      );
    }

    const rows: Row[] = await this.db.select().from(incubatorEntries)
      .where(and(...conditions))
      .orderBy(desc(incubatorEntries.createdAt), desc(incubatorEntries.id))
      .limit(opts.limit + 1);

    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    return { entries: page.map(toStored), nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  /** 4 COUNT(*) (um por estado) — simples e claro; escala bem pro tamanho de incubadora de 1 usuário. */
  async countByState(ownerId: string, now: Date): Promise<IncubatorStateCounts> {
    const counts = { NA_INCUBADORA: 0, GESTANDO: 0, PRONTO: 0, NASCIDO: 0 } as IncubatorStateCounts;
    for (const state of ALL_STATES) {
      const rows: Array<{ count: number }> = await this.db.select({ count: sql<number>`count(*)::int` })
        .from(incubatorEntries)
        .where(and(eq(incubatorEntries.ownerId, ownerId), stateCondition(state, now)!));
      counts[state] = rows[0]?.count ?? 0;
    }
    return counts;
  }

  /**
   * UPDATE...WHERE gestation_started_at IS NULL AND born_specimen_id IS NULL
   * ...RETURNING — atômico de verdade no Postgres (ADR-0021 item 3).
   */
  async claimGestation(id: string, startedAt: Date, endsAt: Date): Promise<StoredIncubatorEntry | null> {
    const rows: Row[] = await this.db.update(incubatorEntries)
      .set({ gestationStartedAt: startedAt, gestationEndsAt: endsAt })
      .where(and(eq(incubatorEntries.id, id), isNull(incubatorEntries.gestationStartedAt), isNull(incubatorEntries.bornSpecimenId)))
      .returning();
    return rows[0] ? toStored(rows[0]) : null;
  }

  /** Órfão (ver nota em `in-memory.repository.ts`) — nenhuma rota chama mais isto. */
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

  /** Ciclo de vida (limpeza preguiçosa, `incubator-lifecycle.ts`) — só as 2 colunas que a checagem de expiração precisa. */
  async listBornSpecimenIds(ownerId: string): Promise<Array<{ id: string; bornSpecimenId: string }>> {
    const rows: Array<{ id: string; bornSpecimenId: string | null }> = await this.db
      .select({ id: incubatorEntries.id, bornSpecimenId: incubatorEntries.bornSpecimenId })
      .from(incubatorEntries)
      .where(and(eq(incubatorEntries.ownerId, ownerId), isNotNull(incubatorEntries.bornSpecimenId)));
    return rows.map((r) => ({ id: r.id, bornSpecimenId: r.bornSpecimenId! }));
  }

  /**
   * `OFFSET cap` numa lista já ordenada (created_at, id) DESC — os primeiros
   * `cap` (mais recentes) são "mantidos"; o que sobra depois do offset É o
   * overflow, direto, sem precisar de um COUNT(*) à parte. Mesmo índice
   * `incubator_entries_owner_created_idx` (owner_id, created_at) de
   * `listByOwner` cobre o ORDER BY; o filtro de estado (gestation_started_at/
   * born_specimen_id IS NULL) é avaliado em cima do resultado já reduzido
   * pelo índice — adequado pro volume por dono (teto de 200), não precisa de
   * índice parcial dedicado (item 5 do pedido: nenhuma mudança de schema).
   */
  async listOldestNonGestatedBeyondCap(ownerId: string, cap: number): Promise<string[]> {
    const rows: Array<{ id: string }> = await this.db
      .select({ id: incubatorEntries.id })
      .from(incubatorEntries)
      .where(and(eq(incubatorEntries.ownerId, ownerId), isNull(incubatorEntries.gestationStartedAt), isNull(incubatorEntries.bornSpecimenId)))
      .orderBy(desc(incubatorEntries.createdAt), desc(incubatorEntries.id))
      .offset(cap);
    return rows.map((r) => r.id);
  }

  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const rows: Array<{ id: string }> = await this.db.delete(incubatorEntries).where(inArray(incubatorEntries.id, ids)).returning({ id: incubatorEntries.id });
    return rows.length;
  }
}
