/**
 * Cota MENSAL de retratos EXTRAS de IA por tier (ADR-0019 — prévia de
 * fenótipo + regenerar; NÃO conta o retrato que já vem incluído em todo
 * cruzamento). FREE 0 · JUNIOR 0 (só créditos) · SENIOR 15 · PHD 20.
 * Excedeu → precisa de crédito. Modelo: o MESMO pra todo tier — FLUX.2 [pro]
 * (fal-ai/flux-2-pro, US$0,03/imagem 1024x1024).
 *
 * Fonte ÚNICA do número: tierPolicy() em ../common/tiers.ts (mesmos valores
 * vendidos em apps/web/lib/plans.ts) — não duplicar a tabela aqui.
 */
import { Injectable } from "@nestjs/common";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Tier } from "@genbreedai/shared";
import { imageQuota } from "../db/schema";
import { createDb } from "../db/client";
import { tierPolicy } from "../common/tiers";
import { isDevFlagEnabled } from "../common/dev-flags";

/** Cota de retratos EXTRAS (prévia/regenerar) — NÃO conta o retrato incluído no cruzamento (ADR-0019). */
export function monthlyImageLimit(tier: string): number { return tierPolicy(tier as Tier)?.monthlyExtraImages ?? 0; }

// DECISÃO: todo tier usa o MESMO modelo (FLUX.2 [pro], US$0,03/imagem
// 1024x1024) — não é mais escolhido por tier. `FAL_MODEL_PHD` não é mais
// lido pra decidir modelo; se ainda estiver definida no ambiente, é
// ignorada (compatibilidade) e um aviso é registrado uma vez no log (não a
// cada chamada) pra alguém notar e remover a env.
let warnedFalModelPhdIgnored = false;
export function modelForTier(tier: string): string {
  void tier; // mantido no parâmetro só por compatibilidade de assinatura com os chamadores existentes.
  if (process.env.FAL_MODEL_PHD && !warnedFalModelPhdIgnored) {
    warnedFalModelPhdIgnored = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[image-quota] FAL_MODEL_PHD está definida mas não é mais usada — todos os tiers usam o mesmo modelo " +
        "(FAL_MODEL, padrão fal-ai/flux-2-pro). Pode remover essa variável de ambiente.",
    );
  }
  return process.env.FAL_MODEL ?? "fal-ai/flux-2-pro";
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
    if (isDevFlagEnabled("IMAGE_QUOTA_UNLIMITED")) return 9999; // DEV — em produção é ignorada
    return Math.max(0, monthlyImageLimit(tier) - (await this.used(owner)));
  }
  /**
   * Tenta consumir 1 imagem da cota; retorna false se esgotou (precisa crédito). ATÔMICO (ADR-0029): o limite é
   * a condição do próprio `INSERT ... ON CONFLICT DO UPDATE ... WHERE used < limit RETURNING` — pedidos
   * simultâneos nunca passam do limite mensal (antes: ler o uso, comparar e só depois incrementar deixava dois
   * pedidos lerem o mesmo valor e ambos gerarem a imagem paga). Limite 0 nem chega a inserir.
   */
  async tryConsume(owner: string, tier: string): Promise<boolean> {
    if (isDevFlagEnabled("IMAGE_QUOTA_UNLIMITED")) return true; // modo DEV: cota ilimitada — em produção é ignorada
    const limit = monthlyImageLimit(tier);
    if (limit <= 0) return false;
    const m = ym();
    if (this.db) {
      const rows = await this.db.insert(imageQuota).values({ ownerId: owner, ym: m, used: 1 })
        .onConflictDoUpdate({
          target: [imageQuota.ownerId, imageQuota.ym],
          set: { used: sql`${imageQuota.used} + 1` },
          setWhere: lt(imageQuota.used, limit),
        })
        .returning({ used: imageQuota.used });
      return rows.length > 0;
    }
    // Sem `await` entre ler e gravar: indivisível (o equivalente em memória do UPSERT condicional).
    const key = `${owner}|${m}`;
    const cur = this.mem.get(key) ?? 0;
    if (cur >= limit) return false;
    this.mem.set(key, cur + 1);
    return true;
  }
}
