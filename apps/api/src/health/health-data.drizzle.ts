import { sql } from "drizzle-orm";
import { HealthDataRepository, type OverdueSummary } from "./health-data.repository";

/**
 * Adapter Drizzle/Postgres do health (ADR-0039). Só SELECTs (nenhuma escrita, nenhuma tabela nova). `db` tipado como `any`, como nos outros
 * adapters (node-postgres ou PGlite). Nada aqui devolve texto do banco — só números e datas.
 */
export class DrizzleHealthDataRepository extends HealthDataRepository {
  constructor(private readonly db: any) { super(); }

  private async one<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T> {
    const res = await this.db.execute(query);
    return (res.rows ?? res)[0] as T;
  }

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }

  async appliedMigrations(): Promise<number> {
    const r = await this.one<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    return Number(r.n);
  }

  async overdueUnnotified(now: Date, minAgeMs: number): Promise<OverdueSummary> {
    const cutoff = new Date(now.getTime() - minAgeMs).toISOString();
    const r = await this.one<{ n: number; oldest: Date | string | null }>(sql`
      select count(*)::int as n, min(gestation_ends_at) as oldest
      from incubator_entries
      where gestation_started_at is not null
        and gestation_ends_at < ${cutoff}::timestamptz
        and ready_notified_at is null
        and born_specimen_id is null`);
    return { count: Number(r.n), oldestEndsAt: r.oldest ? new Date(r.oldest) : null };
  }

  async activeSubscriptions(): Promise<number> {
    const r = await this.one<{ n: number }>(sql`select count(*)::int as n from subscriptions where status = 'ACTIVE'`);
    return Number(r.n);
  }

  async lastBillingEventAt(): Promise<Date | null> {
    const r = await this.one<{ at: Date | string | null }>(sql`
      select greatest((select max(updated_at) from subscriptions), (select max(updated_at) from payment_intents)) as at`);
    return r.at ? new Date(r.at) : null;
  }

  async imagesGeneratedSince(monthStart: Date, ym: string): Promise<number> {
    const start = monthStart.toISOString();
    const r = await this.one<{ n: number }>(sql`
      select (
        (select count(*) from specimens where method <> 'FOUNDER' and created_at >= ${start}::timestamptz)
        + coalesce((select sum(used) from image_quota where ym = ${ym}), 0)
      )::int as n`);
    return Number(r.n);
  }
}
