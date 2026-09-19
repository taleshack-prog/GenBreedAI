/**
 * Porta de persistência de subscriptions (in-memory p/ dev/testes; Drizzle p/
 * Neon) — mesmo padrão de WalletRepository/PaymentIntentsRepository.
 */
import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { subscriptions } from "../db/schema";
import type { PaidTier, SubscriptionInterval } from "./subscription-plans";

export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";

export interface SubscriptionRow {
  id: string; // stripe_subscription_id
  userId: string;
  tier: PaidTier;
  interval: SubscriptionInterval;
  stripeCustomerId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

/** Mapeia o status de assinatura do Stripe pro nosso enum (TDD/migração 0006). */
export function mapStripeSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    default: // incomplete | incomplete_expired | paused
      return "INCOMPLETE";
  }
}

export abstract class SubscriptionsRepository {
  /** checkout.session.completed (mode=subscription): cria a linha. Idempotente por id (retry de webhook). */
  abstract create(row: SubscriptionRow): Promise<void>;
  /** customer.subscription.updated: status + período + cancelamento agendado. */
  abstract updateLifecycle(id: string, patch: { status: SubscriptionStatus; currentPeriodEnd: Date; cancelAtPeriodEnd: boolean }): Promise<void>;
  /** customer.subscription.deleted / invoice.payment_failed: só status. */
  abstract updateStatus(id: string, status: SubscriptionStatus): Promise<void>;
  /**
   * ACTIVE (sempre vale — quem muda o status é o webhook), ou PAST_DUE ainda dentro do período
   * (`currentPeriodEnd > now`, ESTRITO); CANCELED e INCOMPLETE nunca valem. É o que TierService.resolve() consulta.
   * O `now` é PARÂMETRO — vem do `Clock` do `TierService` (ADR-0029): o repositório é só dado, não conhece relógio.
   */
  abstract findActiveForUser(userId: string, now: Date): Promise<SubscriptionRow | null>;
  /** A assinatura mais recente do usuário, qualquer status — pra GET /billing/subscription. */
  abstract findLatestForUser(userId: string): Promise<SubscriptionRow | null>;
  /** Customer Stripe já usado pelo usuário (reuso — Customers duplicados quebram o portal). */
  abstract findCustomerIdForUser(userId: string): Promise<string | null>;
  /** Linha por id de assinatura Stripe (webhook `customer.subscription.updated` só traz o id — ADR-0024, marco "converteu"). `null` se não existe. */
  abstract findById(id: string): Promise<SubscriptionRow | null>;
}

export class InMemorySubscriptionsRepository extends SubscriptionsRepository {
  private readonly rows = new Map<string, SubscriptionRow>();

  async create(row: SubscriptionRow): Promise<void> { this.rows.set(row.id, { ...row }); }

  async updateLifecycle(id: string, patch: { status: SubscriptionStatus; currentPeriodEnd: Date; cancelAtPeriodEnd: boolean }): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, ...patch });
  }

  async updateStatus(id: string, status: SubscriptionStatus): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, status });
  }

  private forUser(userId: string): SubscriptionRow[] {
    return [...this.rows.values()].filter((r) => r.userId === userId);
  }

  async findActiveForUser(userId: string, now: Date): Promise<SubscriptionRow | null> {
    const active = this.forUser(userId)
      .filter((r) => r.status === "ACTIVE" || (r.status === "PAST_DUE" && r.currentPeriodEnd.getTime() > now.getTime()))
      .sort((a, b) => b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime());
    return active[0] ?? null;
  }

  async findLatestForUser(userId: string): Promise<SubscriptionRow | null> {
    const all = this.forUser(userId).sort((a, b) => b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime());
    return all[0] ?? null;
  }

  async findCustomerIdForUser(userId: string): Promise<string | null> {
    const all = this.forUser(userId);
    return all[0]?.stripeCustomerId ?? null;
  }

  async findById(id: string): Promise<SubscriptionRow | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }
}

export class DrizzleSubscriptionsRepository extends SubscriptionsRepository {
  constructor(private readonly db: Database) { super(); }

  async create(row: SubscriptionRow): Promise<void> {
    await this.db.insert(subscriptions).values({
      id: row.id, userId: row.userId, tier: row.tier, interval: row.interval,
      stripeCustomerId: row.stripeCustomerId, status: row.status,
      currentPeriodEnd: row.currentPeriodEnd, cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    }).onConflictDoUpdate({
      target: subscriptions.id,
      set: {
        status: row.status, currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd, updatedAt: new Date(),
      },
    });
  }

  async updateLifecycle(id: string, patch: { status: SubscriptionStatus; currentPeriodEnd: Date; cancelAtPeriodEnd: boolean }): Promise<void> {
    await this.db.update(subscriptions)
      .set({ status: patch.status, currentPeriodEnd: patch.currentPeriodEnd, cancelAtPeriodEnd: patch.cancelAtPeriodEnd, updatedAt: new Date() })
      .where(eq(subscriptions.id, id));
  }

  async updateStatus(id: string, status: SubscriptionStatus): Promise<void> {
    await this.db.update(subscriptions).set({ status, updatedAt: new Date() }).where(eq(subscriptions.id, id));
  }

  private async rowsForUser(userId: string): Promise<SubscriptionRow[]> {
    const rows = await this.db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.currentPeriodEnd));
    return rows.map((r) => ({
      id: r.id, userId: r.userId, tier: r.tier as PaidTier, interval: r.interval as SubscriptionInterval,
      stripeCustomerId: r.stripeCustomerId, status: r.status as SubscriptionStatus,
      currentPeriodEnd: r.currentPeriodEnd, cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    }));
  }

  async findActiveForUser(userId: string, now: Date): Promise<SubscriptionRow | null> {
    const rows = await this.rowsForUser(userId);
    return rows.find((r) => r.status === "ACTIVE" || (r.status === "PAST_DUE" && r.currentPeriodEnd.getTime() > now.getTime())) ?? null;
  }

  async findLatestForUser(userId: string): Promise<SubscriptionRow | null> {
    const rows = await this.rowsForUser(userId);
    return rows[0] ?? null;
  }

  async findCustomerIdForUser(userId: string): Promise<string | null> {
    const rows = await this.rowsForUser(userId);
    return rows[0]?.stripeCustomerId ?? null;
  }

  async findById(id: string): Promise<SubscriptionRow | null> {
    const rows = await this.db.select().from(subscriptions).where(eq(subscriptions.id, id));
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id, userId: r.userId, tier: r.tier as PaidTier, interval: r.interval as SubscriptionInterval,
      stripeCustomerId: r.stripeCustomerId, status: r.status as SubscriptionStatus,
      currentPeriodEnd: r.currentPeriodEnd, cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    };
  }
}
