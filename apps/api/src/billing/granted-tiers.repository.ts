/**
 * Porta de persistência de granted_tiers — tiers concedidos fora do Stripe
 * (ex.: prêmio de indicação eleva o tier por 30 dias). Mesmo padrão de
 * WalletRepository/SubscriptionsRepository. `grant()` é chamado por
 * `ReferralService.recordConversion` (ADR-0024) quando o indicado assina o
 * plano PHD: o INDICADOR ganha 1 mês do plano dele (FREE → JUNIOR), com
 * `reason` "REFERRAL_PHD:<indicado>:<assinatura>". Atenção: `TierService`
 * prioriza assinatura ativa, então para quem JÁ paga o mesmo tier a
 * concessão só passa a valer se a assinatura cair antes de expirar.
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
  /**
   * O tier concedido ainda não expirado de maior posto, se houver mais de um. "Ainda vale" = `expiresAt > now`
   * (ESTRITO: no instante exato do vencimento já não vale). O `now` é PARÂMETRO — vem do `Clock` do `TierService`
   * (ADR-0029: regra dependente de tempo nunca lê a data do sistema; o repositório é só dado, não conhece relógio).
   */
  abstract findActiveForUser(userId: string, now: Date): Promise<GrantedTierRow | null>;
}

export class InMemoryGrantedTiersRepository extends GrantedTiersRepository {
  private readonly rows = new Map<string, GrantedTierRow>();

  async grant(row: GrantedTierRow): Promise<void> { this.rows.set(row.id, { ...row }); }

  async findActiveForUser(userId: string, now: Date): Promise<GrantedTierRow | null> {
    const active = [...this.rows.values()]
      .filter((r) => r.userId === userId && r.expiresAt.getTime() > now.getTime())
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

  async findActiveForUser(userId: string, now: Date): Promise<GrantedTierRow | null> {
    const rows = await this.db.select().from(grantedTiers)
      .where(and(eq(grantedTiers.userId, userId), gt(grantedTiers.expiresAt, now)));
    const best = rows
      .map((r) => ({ id: r.id, userId: r.userId, tier: r.tier as Tier, expiresAt: r.expiresAt, reason: r.reason }))
      .sort((a, b) => RANK[b.tier] - RANK[a.tier]);
    return best[0] ?? null;
  }
}
