/**
 * Porta de persistência de granted_tiers — tiers concedidos fora do Stripe
 * (ex.: prêmio de indicação eleva o tier por 30 dias). Mesmo padrão de
 * WalletRepository/SubscriptionsRepository. `grant()` ainda não é chamado por
 * ninguém nesta fase (o gatilho de recordEvent("convert") do referral fica
 * pro próximo passo) — existe pra TierService já ter o que consultar e pra
 * dar pra testar.
 */
import { eq, gt, and } from "drizzle-orm";
import type { Tier } from "@genbreedai/shared";
import type { Database } from "../db/client";
import { grantedTiers } from "../db/schema";

const RANK: Record<Tier, number> = { FREE: 0, JUNIOR: 1, SENIOR: 2, PHD: 3 };

export interface GrantedTierRow {
  id: string;
  userId: string;
  tier: Tier;
  expiresAt: Date;
  reason: string;
}

export abstract class GrantedTiersRepository {
  abstract grant(row: GrantedTierRow): Promise<void>;
  /** O tier concedido ainda não expirado de maior posto, se houver mais de um. */
  abstract findActiveForUser(userId: string): Promise<GrantedTierRow | null>;
}

export class InMemoryGrantedTiersRepository extends GrantedTiersRepository {
  private readonly rows = new Map<string, GrantedTierRow>();

  async grant(row: GrantedTierRow): Promise<void> { this.rows.set(row.id, { ...row }); }

  async findActiveForUser(userId: string): Promise<GrantedTierRow | null> {
    const now = Date.now();
    const active = [...this.rows.values()]
      .filter((r) => r.userId === userId && r.expiresAt.getTime() > now)
      .sort((a, b) => RANK[b.tier] - RANK[a.tier]);
    return active[0] ?? null;
  }
}

export class DrizzleGrantedTiersRepository extends GrantedTiersRepository {
  constructor(private readonly db: Database) { super(); }

  async grant(row: GrantedTierRow): Promise<void> {
    await this.db.insert(grantedTiers).values({
      id: row.id, userId: row.userId, tier: row.tier, expiresAt: row.expiresAt, reason: row.reason,
    }).onConflictDoNothing({ target: grantedTiers.id });
  }

  async findActiveForUser(userId: string): Promise<GrantedTierRow | null> {
    const rows = await this.db.select().from(grantedTiers)
      .where(and(eq(grantedTiers.userId, userId), gt(grantedTiers.expiresAt, new Date())));
    const best = rows
      .map((r) => ({ id: r.id, userId: r.userId, tier: r.tier as Tier, expiresAt: r.expiresAt, reason: r.reason }))
      .sort((a, b) => RANK[b.tier] - RANK[a.tier]);
    return best[0] ?? null;
  }
}
