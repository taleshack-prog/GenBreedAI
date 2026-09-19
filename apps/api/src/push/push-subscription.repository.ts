/**
 * Porta de persistência das assinaturas de Web Push (ADR-0028) — mesmo padrão dos
 * outros repositórios: classe abstrata + adapter in-memory (dev/testes) + adapter
 * Drizzle (Postgres). Toda porta nova exige os DOIS adapters (CLAUDE.md §7).
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { pushSubscriptions } from "../db/schema";

export interface StoredPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  failedAt: Date | null;
}

export interface PushSubscriptionInput { endpoint: string; p256dh: string; auth: string; userAgent: string | null }

export abstract class PushSubscriptionRepository {
  /**
   * Grava ou ATUALIZA por `endpoint` (único): mesma assinatura de novo não duplica; se o
   * endpoint já existia (mesmo ou outro usuário no mesmo navegador) a linha passa a ser
   * deste usuário, com as chaves novas, `failed_at` zerado e `created_at` preservado.
   */
  abstract upsert(userId: string, input: PushSubscriptionInput, now: Date): Promise<StoredPushSubscription>;
  /** Remove SÓ se o endpoint for deste usuário (ninguém apaga o dispositivo de outro). `true` = existia e foi removida. */
  abstract removeByEndpoint(userId: string, endpoint: string): Promise<boolean>;
  /**
   * Ordem DETERMINÍSTICA e igual nos dois adapters: `created_at` crescente e, em empate, `id`
   * crescente (comparação por código de caractere). Vale como ordem total — mas o `id` é aleatório
   * (uuid), então dispositivos criados no MESMO instante saem numa ordem estável porém arbitrária;
   * quem precisa de "ordem de cadastro" tem que dar `created_at` distintos (o que a produção faz:
   * cada assinatura vem de uma requisição própria).
   */
  abstract listByUser(userId: string): Promise<StoredPushSubscription[]>;
  /** Remove por id (dispositivo desinstalado: o serviço de push devolveu 404/410). */
  abstract deleteById(id: string): Promise<void>;
  /** Envio deu certo: `last_used_at = now`, `failed_at = null`. */
  abstract markUsed(id: string, now: Date): Promise<void>;
  /** Envio falhou por motivo que NÃO é 404/410: `failed_at = now` (a assinatura fica). */
  abstract markFailed(id: string, now: Date): Promise<void>;
}

export class InMemoryPushSubscriptionRepository extends PushSubscriptionRepository {
  private byEndpoint = new Map<string, StoredPushSubscription>();

  async upsert(userId: string, input: PushSubscriptionInput, now: Date) {
    const existing = this.byEndpoint.get(input.endpoint);
    const row: StoredPushSubscription = existing
      ? { ...existing, userId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, failedAt: null }
      : { id: `push_${randomUUID()}`, userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth,
          userAgent: input.userAgent, createdAt: now, lastUsedAt: null, failedAt: null };
    this.byEndpoint.set(input.endpoint, row);
    return { ...row };
  }

  async removeByEndpoint(userId: string, endpoint: string) {
    const row = this.byEndpoint.get(endpoint);
    if (!row || row.userId !== userId) return false;
    this.byEndpoint.delete(endpoint);
    return true;
  }

  async listByUser(userId: string) {
    return [...this.byEndpoint.values()].filter((s) => s.userId === userId)
      // (created_at, id) — o mesmo `ORDER BY` do adapter Drizzle; `id` por código de caractere (não `localeCompare`, que varia com o locale).
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((s) => ({ ...s }));
  }

  async deleteById(id: string) {
    for (const [endpoint, s] of this.byEndpoint) if (s.id === id) this.byEndpoint.delete(endpoint);
  }

  async markUsed(id: string, now: Date) {
    for (const [endpoint, s] of this.byEndpoint) if (s.id === id) this.byEndpoint.set(endpoint, { ...s, lastUsedAt: now, failedAt: null });
  }

  async markFailed(id: string, now: Date) {
    for (const [endpoint, s] of this.byEndpoint) if (s.id === id) this.byEndpoint.set(endpoint, { ...s, failedAt: now });
  }
}

type Row = typeof pushSubscriptions.$inferSelect;
const toStored = (r: Row): StoredPushSubscription => ({
  id: r.id, userId: r.userId, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth,
  userAgent: r.userAgent ?? null, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt ?? null, failedAt: r.failedAt ?? null,
});

export class DrizzlePushSubscriptionRepository extends PushSubscriptionRepository {
  // `db` tipado como any: aceita node-postgres e PGlite (mesmo padrão dos outros adapters).
  constructor(private readonly db: any) { super(); }

  async upsert(userId: string, input: PushSubscriptionInput, now: Date) {
    // Um único INSERT ... ON CONFLICT (endpoint) DO UPDATE — atômico; `created_at` fica de fora do SET (preservado).
    const rows: Row[] = await this.db.insert(pushSubscriptions)
      .values({ id: `push_${randomUUID()}`, userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth,
        userAgent: input.userAgent, createdAt: now })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, failedAt: null },
      })
      .returning();
    return toStored(rows[0]!);
  }

  async removeByEndpoint(userId: string, endpoint: string) {
    const rows: Array<{ id: string }> = await this.db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
      .returning({ id: pushSubscriptions.id });
    return rows.length > 0;
  }

  async listByUser(userId: string) {
    const rows: Row[] = await this.db.select().from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId)).orderBy(asc(pushSubscriptions.createdAt), asc(pushSubscriptions.id));
    return rows.map(toStored);
  }

  async deleteById(id: string) {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  }

  async markUsed(id: string, now: Date) {
    await this.db.update(pushSubscriptions).set({ lastUsedAt: now, failedAt: null }).where(eq(pushSubscriptions.id, id));
  }

  async markFailed(id: string, now: Date) {
    await this.db.update(pushSubscriptions).set({ failedAt: now }).where(eq(pushSubscriptions.id, id));
  }
}
