/**
 * Porta de leitura dos dados que o health check consulta no banco (ADR-0039) — só LEITURA, sem tabela nova. Adapter in-memory (dev/teste, sem
 * `DATABASE_URL`) e adapter Drizzle (`health-data.drizzle.ts`), como as demais portas (ADR-0005/0006).
 */
export interface OverdueSummary {
  /** Gestações vencidas, não nascidas e sem aviso de "gestação concluída". */
  count: number;
  /** `gestation_ends_at` da mais antiga (ou `null` se nenhuma). */
  oldestEndsAt: Date | null;
}

export abstract class HealthDataRepository {
  /** `SELECT 1` — lança se o banco não responde. */
  abstract ping(): Promise<void>;
  /** Quantas migrações o Drizzle registrou como aplicadas (`drizzle.__drizzle_migrations`). */
  abstract appliedMigrations(): Promise<number>;
  /** Gestações com prazo vencido há MAIS de `minAgeMs`, ainda sem nascer e sem aviso (`ready_notified_at` nulo). */
  abstract overdueUnnotified(now: Date, minAgeMs: number): Promise<OverdueSummary>;
  /** Assinaturas Stripe com status ACTIVE. */
  abstract activeSubscriptions(): Promise<number>;
  /** Instante do último evento de cobrança processado (maior `updated_at` de assinaturas e compras) — proxy do último webhook. */
  abstract lastBillingEventAt(): Promise<Date | null>;
  /** Estimativa de imagens geradas no mês: nascimentos (não-fundador) desde `monthStart` + retratos extras (`image_quota.used` de `ym`). */
  abstract imagesGeneratedSince(monthStart: Date, ym: string): Promise<number>;
}

export interface InMemoryHealthValues {
  applied: number;
  overdue: OverdueSummary;
  activeSubscriptions: number;
  lastBillingEventAt: Date | null;
  images: number;
}

/** Sem banco (dev/teste): tudo "vazio e ok". Os testes trocam os valores pelo construtor. */
export class InMemoryHealthDataRepository extends HealthDataRepository {
  private readonly v: InMemoryHealthValues;
  constructor(values: Partial<InMemoryHealthValues> = {}, private readonly pingImpl: () => Promise<void> = async () => {}) {
    super();
    this.v = { applied: 0, overdue: { count: 0, oldestEndsAt: null }, activeSubscriptions: 0, lastBillingEventAt: null, images: 0, ...values };
  }
  ping(): Promise<void> { return this.pingImpl(); }
  async appliedMigrations(): Promise<number> { return this.v.applied; }
  async overdueUnnotified(now: Date, minAgeMs: number): Promise<OverdueSummary> {
    const { count, oldestEndsAt } = this.v.overdue;
    // o fake devolve a MESMA gestação vencida para qualquer limiar, mas só se ela for mais velha que `minAgeMs`
    return oldestEndsAt && now.getTime() - oldestEndsAt.getTime() > minAgeMs ? { count, oldestEndsAt } : { count: 0, oldestEndsAt: null };
  }
  async activeSubscriptions(): Promise<number> { return this.v.activeSubscriptions; }
  async lastBillingEventAt(): Promise<Date | null> { return this.v.lastBillingEventAt; }
  async imagesGeneratedSince(): Promise<number> { return this.v.images; }
}
