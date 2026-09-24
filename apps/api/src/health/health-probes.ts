import Stripe from "stripe";
import { r2Configured, r2Ping, r2UsedBytes } from "../images/storage";

/**
 * Sondas EXTERNAS do health (ADR-0039): fal.ai, R2 e Stripe. Classe abstrata para os testes trocarem por fakes. Nenhuma sonda devolve texto do
 * provedor nem segredo: só números. Quem chama aplica o timeout (2s) — as sondas só fazem a chamada.
 */
export abstract class HealthProbes {
  /**
   * Custo (USD) do mês na fal.ai pela Usage API (`GET https://api.fal.ai/v1/models/usage`, exige chave ADMIN em `FAL_ADMIN_KEY`, cabeçalho
   * `Authorization: Key …`). `null` = sem `FAL_ADMIN_KEY` (não há como consultar). Lança se a fal.ai não responde ou responde erro.
   */
  abstract falMonthCostUsd(monthStart: Date, until: Date): Promise<number | null>;
  abstract r2Configured(): boolean;
  /** Lista 1 objeto do bucket; lança se o R2 não responde. */
  abstract r2Ping(): Promise<void>;
  /** Ocupação do bucket em bytes, da ÚLTIMA medição (recalculada em segundo plano a cada 10 min); `null` enquanto nunca foi medida. Nunca bloqueia. */
  abstract r2OccupancyBytes(now: Date): number | null;
  /** Chamada autenticada barata (`balance.retrieve`); lança se a API do Stripe não responde. */
  abstract stripePing(): Promise<void>;
}

const R2_REMEASURE_MS = 10 * 60 * 1000;

export class DefaultHealthProbes extends HealthProbes {
  private r2Memo: { at: number; bytes: number } | null = null;
  private r2Refreshing = false;

  async falMonthCostUsd(monthStart: Date, until: Date): Promise<number | null> {
    const key = process.env.FAL_ADMIN_KEY?.trim();
    if (!key) return null;
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const end = new Date(until.getTime() + 24 * 60 * 60 * 1000); // `end` exclusivo: inclui hoje
    const url = `https://api.fal.ai/v1/models/usage?start=${day(monthStart)}&end=${day(end)}&expand=summary`;
    const res = await fetch(url, { headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`fal usage HTTP ${res.status}`);
    const body = (await res.json()) as { summary?: { cost_total?: number; cost?: number }[] };
    if (!Array.isArray(body.summary)) throw new Error("fal usage sem summary");
    return body.summary.reduce((sum, item) => sum + Number(item.cost_total ?? item.cost ?? 0), 0);
  }

  r2Configured(): boolean { return r2Configured(); }
  r2Ping(): Promise<void> { return r2Ping(); }

  r2OccupancyBytes(now: Date): number | null {
    const stale = !this.r2Memo || now.getTime() - this.r2Memo.at > R2_REMEASURE_MS;
    if (stale && !this.r2Refreshing) {
      this.r2Refreshing = true;
      void r2UsedBytes()
        .then((u) => { this.r2Memo = { at: now.getTime(), bytes: u.bytes }; })
        .catch(() => { /* mantém a última medição */ })
        .finally(() => { this.r2Refreshing = false; });
    }
    return this.r2Memo?.bytes ?? null;
  }

  async stripePing(): Promise<void> {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("sem STRIPE_SECRET_KEY");
    await new Stripe(key, { timeout: 2000, maxNetworkRetries: 0 }).balance.retrieve();
  }
}
