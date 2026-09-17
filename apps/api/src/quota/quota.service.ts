/**
 * Cota de cruzamento (ADR-0019) — reservas PERSISTIDAS (`cross_reservations`),
 * não mais um contador só em memória que zerava a cada deploy. Duas janelas
 * (CrossQuotaPolicy.window, ver common/tiers.ts):
 *   "rolling7d" — conta reservas com created_at nos últimos 7×24h corridas.
 *   "day"       — conta reservas do DIA CIVIL em America/Sao_Paulo (UTC-3
 *                 fixo — Brasil aboliu horário de verão em 2019, então não
 *                 há troca de offset a considerar aqui).
 *
 * Fluxo (igual ao anterior, só o backing store muda): QuotaGuard reserva
 * (RESERVED) ANTES do motor rodar; CrossController confirma (CONFIRMED) no
 * sucesso ou apaga (estorno) na falha. RESERVED com mais de 10 minutos
 * (processo morto entre reservar e confirmar/apagar) não conta pra ninguém —
 * nunca é apagada por um job à parte, só deixa de ser CONTADA depois desse
 * prazo (ver `countsNow`).
 *
 * SEAM: sem DATABASE_URL (testes), implementação em memória EQUIVALENTE —
 * mesma interface pública, mesmas regras de janela/staleness. A escrita
 * (contar + inserir) não tem nenhum `await` no meio no caminho em memória,
 * então é atômica por construção (JS é single-thread: nada mais roda até a
 * função terminar ou fazer um await de verdade). No Postgres, a atomicidade
 * vem de `pg_advisory_xact_lock(hashtext(owner_id))` dentro da transação —
 * serializa reservas concorrentes do MESMO dono (donos diferentes nunca se
 * bloqueiam, hashtext é só um int por owner_id).
 */

import { Injectable } from "@nestjs/common";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { crossReservations } from "../db/schema";
import { createDb, type Database } from "../db/client";
import type { CrossQuotaPolicy } from "../common/tiers";

const STALE_RESERVED_MS = 10 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

/**
 * Início do dia civil em America/Sao_Paulo, como instante UTC. `en-CA`
 * formata como "AAAA-MM-DD" (truque padrão sem lib de datas) — junta com
 * "T00:00:00-03:00" (offset FIXO do Brasil, sem DST desde 2019) pra virar o
 * instante exato da meia-noite local.
 */
export function startOfSaoPauloDay(now: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00-03:00`);
}

function windowStart(window: CrossQuotaPolicy["window"], now: Date): Date {
  return window === "day" ? startOfSaoPauloDay(now) : new Date(now.getTime() - SEVEN_DAYS_MS);
}

interface MemReservation { id: string; ownerId: string; createdAt: number; status: "RESERVED" | "CONFIRMED"; }

@Injectable()
export class QuotaService {
  private readonly mem: MemReservation[] = [];
  private db: Database | null = null;
  private seq = 0;
  constructor() { const url = process.env.DATABASE_URL; if (url) this.db = createDb(url).db; }

  private newId(): string { this.seq += 1; return `resv_${Date.now()}_${this.seq}`; }

  /** RESERVED só conta se recente (<10min); CONFIRMED sempre conta (nunca expira). */
  private countsNow(status: "RESERVED" | "CONFIRMED", createdAtMs: number, nowMs: number): boolean {
    if (status === "CONFIRMED") return true;
    return nowMs - createdAtMs < STALE_RESERVED_MS;
  }

  /**
   * Reserva atômica de 1 cruzamento. Devolve o id da reserva (pra confirmar
   * ou estornar depois) ou `null` se a cota estourou. `CROSS_QUOTA_UNLIMITED`
   * (modo DEV) devolve sempre um id "fictício", nunca grava nada de verdade.
   */
  async reserve(ownerId: string, policy: CrossQuotaPolicy): Promise<string | null> {
    if (process.env.CROSS_QUOTA_UNLIMITED === "true") return this.newId();
    const now = new Date();
    const from = windowStart(policy.window, now);

    if (this.db) {
      const db = this.db;
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`);
        const staleBefore = new Date(now.getTime() - STALE_RESERVED_MS);
        const rows = await tx.select({ id: crossReservations.id }).from(crossReservations).where(
          and(
            eq(crossReservations.ownerId, ownerId),
            gte(crossReservations.createdAt, from),
            sql`(${crossReservations.status} = 'CONFIRMED' OR ${crossReservations.createdAt} >= ${staleBefore})`,
          ),
        );
        if (rows.length >= policy.limit) return null;
        const id = this.newId();
        await tx.insert(crossReservations).values({ id, ownerId, status: "RESERVED" });
        return id;
      });
    }

    const nowMs = now.getTime();
    const fromMs = from.getTime();
    const count = this.mem.filter(
      (r) => r.ownerId === ownerId && r.createdAt >= fromMs && this.countsNow(r.status, r.createdAt, nowMs),
    ).length;
    if (count >= policy.limit) return null;
    const id = this.newId();
    this.mem.push({ id, ownerId, createdAt: nowMs, status: "RESERVED" });
    return id;
  }

  /** Cruzamento concluiu com sucesso — reserva vira permanente (não expira mais por "stale"). */
  async confirm(reservationId: string): Promise<void> {
    if (this.db) {
      await this.db.update(crossReservations).set({ status: "CONFIRMED" }).where(eq(crossReservations.id, reservationId));
      return;
    }
    const r = this.mem.find((x) => x.id === reservationId);
    if (r) r.status = "CONFIRMED";
  }

  /** Cruzamento falhou — apaga a reserva (estorno). Reserva "fictícia" (CROSS_QUOTA_UNLIMITED) é no-op silencioso. */
  async release(reservationId: string): Promise<void> {
    if (this.db) {
      await this.db.delete(crossReservations).where(eq(crossReservations.id, reservationId));
      return;
    }
    const idx = this.mem.findIndex((x) => x.id === reservationId);
    if (idx >= 0) this.mem.splice(idx, 1);
  }

  /** Quantas reservas válidas (RESERVED recente + CONFIRMED) o dono tem na janela — GET /me/tier. */
  async used(ownerId: string, policy: CrossQuotaPolicy): Promise<number> {
    const now = new Date();
    const from = windowStart(policy.window, now);
    if (this.db) {
      const staleBefore = new Date(now.getTime() - STALE_RESERVED_MS);
      const rows = await this.db.select({ id: crossReservations.id }).from(crossReservations).where(
        and(
          eq(crossReservations.ownerId, ownerId),
          gte(crossReservations.createdAt, from),
          sql`(${crossReservations.status} = 'CONFIRMED' OR ${crossReservations.createdAt} >= ${staleBefore})`,
        ),
      );
      return rows.length;
    }
    const nowMs = now.getTime();
    const fromMs = from.getTime();
    return this.mem.filter(
      (r) => r.ownerId === ownerId && r.createdAt >= fromMs && this.countsNow(r.status, r.createdAt, nowMs),
    ).length;
  }

  /**
   * Próximo instante em que volta a ter cota — `null` se já tem cota AGORA.
   * "day": início do PRÓXIMO dia civil em America/Sao_Paulo (nenhuma reserva
   * "envelhece" dentro do mesmo dia — só a virada de dia libera cota de novo).
   * "rolling7d": instante em que a reserva mais ANTIGA da janela completa 7 dias.
   */
  async nextAvailableAt(ownerId: string, policy: CrossQuotaPolicy): Promise<Date | null> {
    const now = new Date();
    const usedNow = await this.used(ownerId, policy);
    if (usedNow < policy.limit) return null;

    if (policy.window === "day") {
      return new Date(startOfSaoPauloDay(now).getTime() + 24 * 3600 * 1000);
    }

    const from = windowStart(policy.window, now);
    if (this.db) {
      const staleBefore = new Date(now.getTime() - STALE_RESERVED_MS);
      const rows = await this.db.select({ createdAt: crossReservations.createdAt }).from(crossReservations).where(
        and(
          eq(crossReservations.ownerId, ownerId),
          gte(crossReservations.createdAt, from),
          sql`(${crossReservations.status} = 'CONFIRMED' OR ${crossReservations.createdAt} >= ${staleBefore})`,
        ),
      ).orderBy(asc(crossReservations.createdAt)).limit(1);
      const oldest = rows[0]?.createdAt;
      return oldest ? new Date(oldest.getTime() + SEVEN_DAYS_MS) : null;
    }

    const nowMs = now.getTime();
    const fromMs = from.getTime();
    const relevant = this.mem
      .filter((r) => r.ownerId === ownerId && r.createdAt >= fromMs && this.countsNow(r.status, r.createdAt, nowMs))
      .sort((a, b) => a.createdAt - b.createdAt);
    const oldest = relevant[0];
    return oldest ? new Date(oldest.createdAt + SEVEN_DAYS_MS) : null;
  }

  /** Uso apenas em testes: limpa tudo (equivalente em memória). */
  resetAll(): void { this.mem.length = 0; }
}
