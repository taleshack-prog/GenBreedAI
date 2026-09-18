/**
 * Reservas atômicas PERSISTIDAS, reusadas por DOIS limites independentes
 * (ADR-0021 — gestação; "reveal" da ADR-0020 virou "birth" aqui, mesmos
 * valores/janelas, só o alvo mudou de "revelar" pra "iniciar gestação"):
 *   "cross_hourly" — limite TÉCNICO anti-abuso em POST /cross (60/hora,
 *                    igual pra todo tier, ADR-0020) — MESMA tabela
 *                    `cross_reservations` que antes guardava a cota de
 *                    cruzamento (ADR-0019), só o SIGNIFICADO mudou.
 *   "birth"        — vaga de GESTAÇÃO por tier (rolling7d/day, ADR-0021,
 *                    era a cota de revelação da ADR-0020, era a cota de
 *                    cruzamento da ADR-0019) — tabela `birth_reservations`
 *                    (renomeada de `reveal_reservations`, mesma forma,
 *                    contador independente: gestar não deve consumir o teto
 *                    horário de cruzar, nem vice-versa).
 *
 * Três janelas (`ReservationPolicy.window`):
 *   "hour"      — últimos 60 minutos corridos (só usada por "cross_hourly").
 *   "rolling7d" — últimos 7×24h corridos.
 *   "day"       — DIA CIVIL em America/Sao_Paulo (UTC-3 fixo — Brasil aboliu
 *                 horário de verão em 2019, sem troca de offset a considerar).
 *
 * Fluxo (igual ao de antes, ADR-0019): reserva (RESERVED) ANTES da operação
 * rodar; quem chama confirma (CONFIRMED) no sucesso ou apaga (estorno) na
 * falha. RESERVED com mais de 10 minutos (processo morto entre reservar e
 * confirmar/apagar) não conta pra ninguém — nunca é apagada por um job à
 * parte, só deixa de ser CONTADA depois desse prazo (ver `countsNow`).
 *
 * SEAM: sem DATABASE_URL (testes), implementação em memória EQUIVALENTE —
 * mesma interface pública, mesmas regras de janela/staleness, um Map por
 * `kind` (nunca mistura as duas contagens). A escrita (contar + inserir) não
 * tem nenhum `await` no meio no caminho em memória, então é atômica por
 * construção (JS é single-thread). No Postgres, a atomicidade vem de
 * `pg_advisory_xact_lock(hashtext(owner_id))` dentro da transação — serializa
 * reservas concorrentes do MESMO dono (donos diferentes nunca se bloqueiam).
 *
 * "Agora" vem de `Clock` (injetado, `../common/clock.ts`), nunca de
 * `new Date()` direto — testes avançam `SystemClock.setForTesting()` em vez
 * de `vi.useFakeTimers()` global, que travaria `app.inject()` nos e2e (ver
 * nota em `clock.ts`).
 */

import { Injectable } from "@nestjs/common";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { crossReservations, birthReservations } from "../db/schema";
import { createDb, type Database } from "../db/client";
import { isQuotaUnlimitedDev } from "./quota-unlimited-dev";
import { Clock } from "../common/clock";

export type ReservationWindow = "hour" | "rolling7d" | "day";
export interface ReservationPolicy { limit: number; window: ReservationWindow; }
export type ReservationKind = "cross_hourly" | "birth";

const TABLE_BY_KIND = { cross_hourly: crossReservations, birth: birthReservations };

const STALE_RESERVED_MS = 10 * 60 * 1000;
const WINDOW_MS: Record<"hour" | "rolling7d", number> = {
  hour: 3600 * 1000,
  rolling7d: 7 * 24 * 3600 * 1000,
};

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

function windowStart(window: ReservationWindow, now: Date): Date {
  return window === "day" ? startOfSaoPauloDay(now) : new Date(now.getTime() - WINDOW_MS[window]);
}

interface MemReservation { id: string; ownerId: string; createdAt: number; status: "RESERVED" | "CONFIRMED"; }

@Injectable()
export class QuotaService {
  // Um array em memória POR `kind` — nunca mistura a contagem horária de
  // cruzamento com a contagem de gestação.
  private readonly mem: Record<ReservationKind, MemReservation[]> = { cross_hourly: [], birth: [] };
  private db: Database | null = null;
  private seq = 0;
  constructor(private readonly clock: Clock) { const url = process.env.DATABASE_URL; if (url) this.db = createDb(url).db; }

  private newId(): string { this.seq += 1; return `resv_${Date.now()}_${this.seq}`; }

  /** RESERVED só conta se recente (<10min); CONFIRMED sempre conta (nunca expira). */
  private countsNow(status: "RESERVED" | "CONFIRMED", createdAtMs: number, nowMs: number): boolean {
    if (status === "CONFIRMED") return true;
    return nowMs - createdAtMs < STALE_RESERVED_MS;
  }

  /**
   * Reserva atômica de 1 unidade (cruzamento horário OU vaga de gestação,
   * conforme `kind`). Devolve o id da reserva (pra confirmar ou estornar
   * depois) ou `null` se a cota estourou. `QUOTA_UNLIMITED_DEV` (modo
   * DEV/teste — NUNCA em produção, ver `isQuotaUnlimitedDev()`) devolve
   * sempre um id "fictício", nunca grava nada de verdade — vale pros dois
   * `kind`s.
   */
  async reserve(kind: ReservationKind, ownerId: string, policy: ReservationPolicy): Promise<string | null> {
    if (isQuotaUnlimitedDev()) return this.newId();
    const now = this.clock.now();
    const from = windowStart(policy.window, now);
    const table = TABLE_BY_KIND[kind];

    if (this.db) {
      const db = this.db;
      return db.transaction(async (tx) => {
        // Lock por (dono, kind) — hashtext de string única evita que a
        // reserva horária de cruzamento serialize com a de gestação do
        // MESMO dono à toa (são contadores independentes).
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${kind}:${ownerId}`}))`);
        const staleBefore = new Date(now.getTime() - STALE_RESERVED_MS);
        const rows = await tx.select({ id: table.id }).from(table).where(
          and(
            eq(table.ownerId, ownerId),
            gte(table.createdAt, from),
            sql`(${table.status} = 'CONFIRMED' OR ${table.createdAt} >= ${staleBefore})`,
          ),
        );
        if (rows.length >= policy.limit) return null;
        const id = this.newId();
        await tx.insert(table).values({ id, ownerId, status: "RESERVED" });
        return id;
      });
    }

    const nowMs = now.getTime();
    const fromMs = from.getTime();
    const store = this.mem[kind];
    const count = store.filter(
      (r) => r.ownerId === ownerId && r.createdAt >= fromMs && this.countsNow(r.status, r.createdAt, nowMs),
    ).length;
    if (count >= policy.limit) return null;
    const id = this.newId();
    store.push({ id, ownerId, createdAt: nowMs, status: "RESERVED" });
    return id;
  }

  /** Operação concluiu com sucesso — reserva vira permanente (não expira mais por "stale"). */
  async confirm(kind: ReservationKind, reservationId: string): Promise<void> {
    if (this.db) {
      await this.db.update(TABLE_BY_KIND[kind]).set({ status: "CONFIRMED" }).where(eq(TABLE_BY_KIND[kind].id, reservationId));
      return;
    }
    const r = this.mem[kind].find((x) => x.id === reservationId);
    if (r) r.status = "CONFIRMED";
  }

  /** Operação falhou — apaga a reserva (estorno). Reserva "fictícia" (QUOTA_UNLIMITED_DEV) é no-op silencioso. */
  async release(kind: ReservationKind, reservationId: string): Promise<void> {
    if (this.db) {
      await this.db.delete(TABLE_BY_KIND[kind]).where(eq(TABLE_BY_KIND[kind].id, reservationId));
      return;
    }
    const store = this.mem[kind];
    const idx = store.findIndex((x) => x.id === reservationId);
    if (idx >= 0) store.splice(idx, 1);
  }

  /** Quantas reservas válidas (RESERVED recente + CONFIRMED) o dono tem na janela — GET /me/tier. */
  async used(kind: ReservationKind, ownerId: string, policy: ReservationPolicy): Promise<number> {
    const now = this.clock.now();
    const from = windowStart(policy.window, now);
    const table = TABLE_BY_KIND[kind];
    if (this.db) {
      const staleBefore = new Date(now.getTime() - STALE_RESERVED_MS);
      const rows = await this.db.select({ id: table.id }).from(table).where(
        and(
          eq(table.ownerId, ownerId),
          gte(table.createdAt, from),
          sql`(${table.status} = 'CONFIRMED' OR ${table.createdAt} >= ${staleBefore})`,
        ),
      );
      return rows.length;
    }
    const nowMs = now.getTime();
    const fromMs = from.getTime();
    return this.mem[kind].filter(
      (r) => r.ownerId === ownerId && r.createdAt >= fromMs && this.countsNow(r.status, r.createdAt, nowMs),
    ).length;
  }

  /**
   * Próximo instante em que volta a ter cota — `null` se já tem cota AGORA.
   * "day": início do PRÓXIMO dia civil em America/Sao_Paulo (nenhuma reserva
   * "envelhece" dentro do mesmo dia — só a virada de dia libera cota de novo).
   * "hour"/"rolling7d": instante em que a reserva mais ANTIGA da janela sai dela.
   */
  async nextAvailableAt(kind: ReservationKind, ownerId: string, policy: ReservationPolicy): Promise<Date | null> {
    const now = this.clock.now();
    const usedNow = await this.used(kind, ownerId, policy);
    if (usedNow < policy.limit) return null;

    if (policy.window === "day") {
      return new Date(startOfSaoPauloDay(now).getTime() + 24 * 3600 * 1000);
    }
    const windowMs = WINDOW_MS[policy.window];

    const from = windowStart(policy.window, now);
    const table = TABLE_BY_KIND[kind];
    if (this.db) {
      const staleBefore = new Date(now.getTime() - STALE_RESERVED_MS);
      const rows = await this.db.select({ createdAt: table.createdAt }).from(table).where(
        and(
          eq(table.ownerId, ownerId),
          gte(table.createdAt, from),
          sql`(${table.status} = 'CONFIRMED' OR ${table.createdAt} >= ${staleBefore})`,
        ),
      ).orderBy(asc(table.createdAt)).limit(1);
      const oldest = rows[0]?.createdAt;
      return oldest ? new Date(oldest.getTime() + windowMs) : null;
    }

    const nowMs = now.getTime();
    const fromMs = from.getTime();
    const relevant = this.mem[kind]
      .filter((r) => r.ownerId === ownerId && r.createdAt >= fromMs && this.countsNow(r.status, r.createdAt, nowMs))
      .sort((a, b) => a.createdAt - b.createdAt);
    const oldest = relevant[0];
    return oldest ? new Date(oldest.createdAt + windowMs) : null;
  }

  /** Uso apenas em testes: limpa tudo (equivalente em memória), os dois `kind`s. */
  resetAll(): void { this.mem.cross_hourly.length = 0; this.mem.birth.length = 0; }
}
