/**
 * Porta de persistência de subscriptions (in-memory p/ dev/testes; Drizzle p/
 * Neon) — mesmo padrão de WalletRepository/PaymentIntentsRepository.
 */
import { and, desc, eq, gte, isNull, lte, ne, or } from "drizzle-orm";
import type { Database } from "../db/client";
import { subscriptions } from "../db/schema";
import type { PaidTier, SubscriptionInterval } from "./subscription-plans";

export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";

/** Avisos de assinatura (ADR-0030): 3 dias antes do fim / pagamento falhou / voltou para o gratuito. */
export type SubscriptionNoticeKind = "EXPIRING" | "PAST_DUE" | "DROPPED";
/** Por aviso: o `currentPeriodEnd` do período para o qual ele já foi reivindicado (ausente/null = nunca). */
export type NoticeMarkers = Partial<Record<SubscriptionNoticeKind, Date | null>>;

export interface SubscriptionRow {
  id: string; // stripe_subscription_id
  userId: string;
  tier: PaidTier;
  interval: SubscriptionInterval;
  stripeCustomerId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  /** ADR-0030 — marcas de "aviso já enviado neste período". Opcional: quem cria a linha (webhook) não informa. */
  noticeFor?: NoticeMarkers;
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

/**
 * A REGRA de vigência da assinatura — ÚNICA definição (ADR-0029): `ACTIVE` sempre vale (quem muda o status é o
 * webhook); `PAST_DUE` vale enquanto `currentPeriodEnd > agora` (ESTRITO — no instante do fim já não vale);
 * `CANCELED` e `INCOMPLETE` nunca valem. Os dois adapters e os avisos de assinatura (ADR-0030) usam esta função —
 * ninguém reimplementa a regra.
 */
export function isSubscriptionInForce(row: Pick<SubscriptionRow, "status" | "currentPeriodEnd">, now: Date): boolean {
  return row.status === "ACTIVE" || (row.status === "PAST_DUE" && row.currentPeriodEnd.getTime() > now.getTime());
}

/** Janelas (em ms) que definem quais linhas o cron olha em `listNoticeCandidates` — o corte fino é feito em `subscription-notices.ts`. */
export interface NoticeWindows { expiringMs: number; droppedMs: number }

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
  /** TODAS as assinaturas do usuário (qualquer status), mais recentes primeiro — pra faixa de aviso (ADR-0030). */
  abstract listForUser(userId: string): Promise<SubscriptionRow[]>;
  /** Customer Stripe já usado pelo usuário (reuso — Customers duplicados quebram o portal). */
  abstract findCustomerIdForUser(userId: string): Promise<string | null>;
  /** Linha por id de assinatura Stripe (webhook `customer.subscription.updated` só traz o id — ADR-0024, marco "converteu"). `null` se não existe. */
  abstract findById(id: string): Promise<SubscriptionRow | null>;
  /**
   * ADR-0030 — linhas que PODEM ter aviso a enviar (o `push:dispatch` decide o resto com `subscription-notices.ts`):
   * `PAST_DUE`; `ACTIVE` com cancelamento agendado e fim do período dentro de `expiringMs`; `CANCELED` cujo fim do
   * período está a menos de `droppedMs` no passado (ou no futuro). Nunca varre o histórico inteiro de canceladas.
   */
  abstract listNoticeCandidates(now: Date, windows: NoticeWindows): Promise<SubscriptionRow[]>;
  /**
   * ADR-0030 — reivindica ATOMICAMENTE o aviso `kind` do PERÍODO atual desta linha: `UPDATE ... SET <marca> =
   * current_period_end WHERE id = ? AND status/período/cancelamento IGUAIS aos lidos AND (<marca> IS NULL OR <marca> <>
   * current_period_end) RETURNING`. `true` = ESTA chamada reivindicou (pode enviar); `false` = outra execução já
   * reivindicou este período, ou a linha mudou desde a leitura (renovou, reativou…). Uma vez por período.
   */
  abstract claimNotice(row: SubscriptionRow, kind: SubscriptionNoticeKind): Promise<boolean>;
}

/** Copia defensiva (o chamador não altera o estado interno por acidente). */
function copyRow(r: SubscriptionRow): SubscriptionRow {
  return { ...r, currentPeriodEnd: new Date(r.currentPeriodEnd), noticeFor: r.noticeFor ? { ...r.noticeFor } : undefined };
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
      .filter((r) => isSubscriptionInForce(r, now))
      .sort((a, b) => b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime());
    return active[0] ?? null;
  }

  async findLatestForUser(userId: string): Promise<SubscriptionRow | null> {
    const all = this.forUser(userId).sort((a, b) => b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime());
    return all[0] ?? null;
  }

  async listForUser(userId: string): Promise<SubscriptionRow[]> {
    return this.forUser(userId).sort((a, b) => b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime()).map(copyRow);
  }

  async findCustomerIdForUser(userId: string): Promise<string | null> {
    const all = this.forUser(userId);
    return all[0]?.stripeCustomerId ?? null;
  }

  async findById(id: string): Promise<SubscriptionRow | null> {
    const row = this.rows.get(id);
    return row ? copyRow(row) : null;
  }

  async listNoticeCandidates(now: Date, w: NoticeWindows): Promise<SubscriptionRow[]> {
    const nowMs = now.getTime();
    return [...this.rows.values()].filter((r) => {
      const end = r.currentPeriodEnd.getTime();
      if (r.status === "PAST_DUE") return true;
      if (r.status === "ACTIVE") return r.cancelAtPeriodEnd && end <= nowMs + w.expiringMs;
      if (r.status === "CANCELED") return end >= nowMs - w.droppedMs;
      return false;
    }).map(copyRow);
  }

  /** Sem `await` entre ler e gravar: indivisível (o equivalente em memória do UPDATE condicional do Postgres). */
  async claimNotice(row: SubscriptionRow, kind: SubscriptionNoticeKind): Promise<boolean> {
    const cur = this.rows.get(row.id);
    if (!cur) return false;
    if (cur.currentPeriodEnd.getTime() !== row.currentPeriodEnd.getTime() || cur.status !== row.status || cur.cancelAtPeriodEnd !== row.cancelAtPeriodEnd) return false;
    const marked = cur.noticeFor?.[kind];
    if (marked && marked.getTime() === cur.currentPeriodEnd.getTime()) return false; // este período já foi reivindicado
    this.rows.set(row.id, { ...cur, noticeFor: { ...cur.noticeFor, [kind]: new Date(cur.currentPeriodEnd) } });
    return true;
  }
}

/** Coluna de marca por tipo de aviso (ADR-0030). */
const NOTICE_COLUMN = {
  EXPIRING: { key: "expiryNoticeFor", col: subscriptions.expiryNoticeFor },
  PAST_DUE: { key: "paymentFailedNoticeFor", col: subscriptions.paymentFailedNoticeFor },
  DROPPED: { key: "droppedNoticeFor", col: subscriptions.droppedNoticeFor },
} as const;

type DbSubscriptionRow = typeof subscriptions.$inferSelect;
function toRow(r: DbSubscriptionRow): SubscriptionRow {
  return {
    id: r.id, userId: r.userId, tier: r.tier as PaidTier, interval: r.interval as SubscriptionInterval,
    stripeCustomerId: r.stripeCustomerId, status: r.status as SubscriptionStatus,
    currentPeriodEnd: r.currentPeriodEnd, cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    noticeFor: { EXPIRING: r.expiryNoticeFor ?? null, PAST_DUE: r.paymentFailedNoticeFor ?? null, DROPPED: r.droppedNoticeFor ?? null },
  };
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
    return rows.map(toRow);
  }

  async findActiveForUser(userId: string, now: Date): Promise<SubscriptionRow | null> {
    const rows = await this.rowsForUser(userId);
    return rows.find((r) => isSubscriptionInForce(r, now)) ?? null;
  }

  async findLatestForUser(userId: string): Promise<SubscriptionRow | null> {
    const rows = await this.rowsForUser(userId);
    return rows[0] ?? null;
  }

  async listForUser(userId: string): Promise<SubscriptionRow[]> {
    return this.rowsForUser(userId);
  }

  async findCustomerIdForUser(userId: string): Promise<string | null> {
    const rows = await this.rowsForUser(userId);
    return rows[0]?.stripeCustomerId ?? null;
  }

  async findById(id: string): Promise<SubscriptionRow | null> {
    const rows = await this.db.select().from(subscriptions).where(eq(subscriptions.id, id));
    return rows[0] ? toRow(rows[0]) : null;
  }

  async listNoticeCandidates(now: Date, w: NoticeWindows): Promise<SubscriptionRow[]> {
    const rows = await this.db.select().from(subscriptions).where(or(
      eq(subscriptions.status, "PAST_DUE"),
      and(eq(subscriptions.status, "ACTIVE"), eq(subscriptions.cancelAtPeriodEnd, true), lte(subscriptions.currentPeriodEnd, new Date(now.getTime() + w.expiringMs))),
      and(eq(subscriptions.status, "CANCELED"), gte(subscriptions.currentPeriodEnd, new Date(now.getTime() - w.droppedMs))),
    ));
    return rows.map(toRow);
  }

  /**
   * UPDATE condicional (atômico): só grava a marca se a linha ainda é a que foi lida (status, período e cancelamento
   * iguais) e ainda não foi reivindicada NESTE período. Duas execuções simultâneas: a segunda reavalia a condição
   * depois do lock da linha, vê a marca e recebe 0 linhas.
   */
  async claimNotice(row: SubscriptionRow, kind: SubscriptionNoticeKind): Promise<boolean> {
    const { key, col } = NOTICE_COLUMN[kind];
    const rows = await this.db.update(subscriptions)
      .set({ [key]: row.currentPeriodEnd } as Partial<typeof subscriptions.$inferInsert>)
      .where(and(
        eq(subscriptions.id, row.id),
        eq(subscriptions.currentPeriodEnd, row.currentPeriodEnd),
        eq(subscriptions.status, row.status),
        eq(subscriptions.cancelAtPeriodEnd, row.cancelAtPeriodEnd),
        or(isNull(col), ne(col, subscriptions.currentPeriodEnd)),
      ))
      .returning({ id: subscriptions.id });
    return rows.length > 0;
  }
}
