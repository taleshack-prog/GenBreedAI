/**
 * Cota MENSAL de imagem IA por tier (economia — protege a margem da fal.ai).
 * FREE 0 (só procedural) · JUNIOR 10 · SENIOR 20 · PHD 30. Excedeu → precisa de
 * crédito. Modelo por tier: PhD usa FLUX Pro; demais usam FLUX dev.
 */
import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { imageQuota } from "../db/schema";
import { createDb } from "../db/client";

const MONTHLY: Record<string, number> = { FREE: 0, JUNIOR: 10, SENIOR: 20, PHD: 30 };
export function monthlyImageLimit(tier: string): number { return MONTHLY[tier] ?? 0; }
export function modelForTier(tier: string): string {
  const dev = process.env.FAL_MODEL ?? "fal-ai/flux/dev";
  // PhD usa o modelo premium só se FAL_MODEL_PHD estiver definido; senão cai no dev (evita rota inválida).
  return tier === "PHD" ? (process.env.FAL_MODEL_PHD ?? dev) : dev;
}
function ym(): string { return new Date().toISOString().slice(0, 7); }

@Injectable()
export class ImageQuotaService {
  private readonly mem = new Map<string, number>(); // "owner|ym" → used (fallback)
  private db: ReturnType<typeof createDb>["db"] | null = null;
  constructor() { const url = process.env.DATABASE_URL; if (url) this.db = createDb(url).db; }

  async used(owner: string): Promise<number> {
    const m = ym();
    if (this.db) {
      const rows = await this.db.select().from(imageQuota).where(and(eq(imageQuota.ownerId, owner), eq(imageQuota.ym, m)));
      return rows[0]?.used ?? 0;
    }
    return this.mem.get(`${owner}|${m}`) ?? 0;
  }
  async remaining(owner: string, tier: string): Promise<number> {
    if (process.env.IMAGE_QUOTA_UNLIMITED === "true") return 9999;
    return Math.max(0, monthlyImageLimit(tier) - (await this.used(owner)));
  }
  /** Tenta consumir 1 imagem da cota; retorna false se esgotou (precisa crédito). */
  async tryConsume(owner: string, tier: string): Promise<boolean> {
    if (process.env.IMAGE_QUOTA_UNLIMITED === "true") return true; // modo DEV: cota ilimitada
    const limit = monthlyImageLimit(tier);
    const m = ym();
    const cur = await this.used(owner);
    if (cur >= limit) return false;
    if (this.db) {
      await this.db.insert(imageQuota).values({ ownerId: owner, ym: m, used: 1 })
        .onConflictDoUpdate({ target: [imageQuota.ownerId, imageQuota.ym], set: { used: sql`${imageQuota.used} + 1` } });
    } else {
      this.mem.set(`${owner}|${m}`, cur + 1);
    }
    return true;
  }
}
