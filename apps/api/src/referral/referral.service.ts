/**
 * Motor de indicação (viralização — TDD ReferralLink). Crédito ESCALONADO por
 * profundidade de engajamento (anti-fraude): clique=0, instalou=+1, D1=+1,
 * D7=+2, converteu=+15 créditos de imagem. Cada marco credita 1x por indicado.
 */
import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { referralLinks, referralReferred } from "../db/schema";
import { createDb } from "../db/client";
import { WalletService } from "../economy/wallet.service";

export type RefEvent = "install" | "d1" | "d7" | "convert";
const REWARD: Record<RefEvent, number> = { install: 1, d1: 1, d7: 2, convert: 15 };

@Injectable()
export class ReferralService {
  private db: ReturnType<typeof createDb>["db"] | null = null;
  private memLinks = new Map<string, any>();
  private memRef = new Map<string, any>();
  constructor(private readonly wallet: WalletService) {
    const url = process.env.DATABASE_URL; if (url) this.db = createDb(url).db;
  }

  private genCode(owner: string): string {
    return (owner.slice(0, 3) + Math.random().toString(36).slice(2, 8)).toLowerCase();
  }

  async getOrCreateLink(owner: string) {
    if (this.db) {
      const rows = await this.db.select().from(referralLinks).where(eq(referralLinks.ownerId, owner));
      if (rows[0]) return rows[0];
      const code = this.genCode(owner);
      await this.db.insert(referralLinks).values({ ownerId: owner, code }).onConflictDoNothing({ target: referralLinks.ownerId });
      const again = await this.db.select().from(referralLinks).where(eq(referralLinks.ownerId, owner));
      return again[0];
    }
    if (!this.memLinks.has(owner)) this.memLinks.set(owner, { ownerId: owner, code: this.genCode(owner), clicks: 0, installs: 0, d1: 0, d7: 0, conversions: 0, creditsEarned: 0 });
    return this.memLinks.get(owner);
  }

  async byCode(code: string) {
    if (this.db) { const r = await this.db.select().from(referralLinks).where(eq(referralLinks.code, code)); return r[0] ?? null; }
    for (const l of this.memLinks.values()) if (l.code === code) return l;
    return null;
  }

  async recordClick(code: string) {
    if (this.db) { await this.db.update(referralLinks).set({ clicks: sql`${referralLinks.clicks} + 1` }).where(eq(referralLinks.code, code)); return; }
    const l = await this.byCode(code); if (l) l.clicks++;
  }

  /** Registra um marco do indicado e credita o dono do link (1x por marco). */
  async recordEvent(code: string, referredId: string, kind: RefEvent) {
    const link = await this.byCode(code);
    if (!link || link.ownerId === referredId) return { credited: 0 }; // sem auto-indicação
    const field = kind === "install" ? "installCredited" : kind === "d1" ? "d1Credited" : kind === "d7" ? "d7Credited" : "convertCredited";
    const counter = kind === "install" ? "installs" : kind === "d1" ? "d1" : kind === "d7" ? "d7" : "conversions";

    let already = false;
    if (this.db) {
      const rows = await this.db.select().from(referralReferred).where(and(eq(referralReferred.code, code), eq(referralReferred.referredId, referredId)));
      const row = rows[0];
      if (!row) await this.db.insert(referralReferred).values({ code, referredId, firstSeen: new Date().toISOString(), [field]: true } as any);
      else if ((row as any)[field]) already = true;
      else await this.db.update(referralReferred).set({ [field]: true } as any).where(and(eq(referralReferred.code, code), eq(referralReferred.referredId, referredId)));
    } else {
      const k = `${code}|${referredId}`;
      const row = this.memRef.get(k) ?? { code, referredId };
      if (row[field]) already = true; else { row[field] = true; this.memRef.set(k, row); }
    }
    if (already) return { credited: 0 };

    const reward = REWARD[kind];
    await this.wallet.creditImageCredits(link.ownerId, reward);
    if (this.db) {
      await this.db.update(referralLinks).set({ [counter]: sql`${(referralLinks as any)[counter]} + 1`, creditsEarned: sql`${referralLinks.creditsEarned} + ${reward}` } as any).where(eq(referralLinks.code, code));
    } else { link[counter]++; link.creditsEarned += reward; }
    return { credited: reward };
  }
}
