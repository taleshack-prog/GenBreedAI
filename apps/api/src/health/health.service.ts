import { Inject, Injectable } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Clock } from "../common/clock";
import { authSecretProblem } from "../common/auth-secret";
import { databaseUrlProblem } from "../common/database-url";
import { r2Status } from "../common/r2-config";
import { stripeKeyActive, stripeProductionProblems } from "../common/stripe-config";
import { vapidProblem } from "../common/vapid-config";
import { isPushEnabled } from "../common/vapid";
import { HealthDataRepository } from "./health-data.repository";
import { HealthProbes } from "./health-probes";
import { summarizeDetail, worstStatus, type HealthCheck, type HealthStatus, type HealthSummary } from "./health.types";

/**
 * Health check central da Hack Tech Farm (ADR-0039). Roda os 8 checks EM PARALELO, cada um com timeout individual (padrão 2s — orçamento total ≤ 6s por
 * construção), e devolve o PIOR status. Cache de 30s da resposta inteira (a rota não pesa no banco nem custa na fal.ai). Nenhum texto de erro do
 * banco/provedor vai para o corpo: só frases fixas e números — nenhum segredo, e-mail ou string de conexão.
 */
export interface HealthOptions {
  timeoutMs: number;
  cacheMs: number;
  /** Tags das migrações do journal do Drizzle (`drizzle/meta/_journal.json`), em ordem; `null` = journal não encontrado. */
  migrationTags: () => string[] | null;
}

export const HEALTH_OPTIONS = Symbol("HEALTH_OPTIONS");

/** Lê os arquivos de migração pelo journal do Drizzle (a mesma fonte do `migrate`). */
export function readMigrationTags(): string[] | null {
  const candidates = [
    fileURLToPath(new URL("../../drizzle/meta/_journal.json", import.meta.url)), // apps/api/drizzle, relativo a este arquivo
    join(process.cwd(), "drizzle", "meta", "_journal.json"), // como o `db:migrate` (cwd = apps/api)
  ];
  for (const path of candidates) {
    try {
      const journal = JSON.parse(readFileSync(path, "utf8")) as { entries: { idx: number; tag: string }[] };
      return [...journal.entries].sort((a, b) => a.idx - b.idx).map((e) => e.tag);
    } catch { /* tenta o próximo */ }
  }
  return null;
}

export const DEFAULT_HEALTH_OPTIONS: HealthOptions = { timeoutMs: 2000, cacheMs: 30_000, migrationTags: readMigrationTags };

/** `push:dispatch` roda a cada 5 min; folga de 3 min antes de considerar atraso. */
export const CRON_PUSH_INTERVAL_MIN = 5;
export const CRON_PUSH_SLACK_MIN = 3;
/** Preço por imagem (USD) na estimativa sem `FAL_ADMIN_KEY` — FLUX.2 pro em 1 MP (informado pelo dono); sobrescreve com `FAL_IMAGE_COST_USD`. */
export const DEFAULT_FAL_IMAGE_COST_USD = 0.03;
const HOUR_MS = 60 * 60 * 1000;
const GB = 1024 ** 3;

class CheckTimeout extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CheckTimeout()), ms); timer.unref?.(); });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const secondsLabel = (ms: number) => `${+(ms / 1000).toFixed(2)}s`;
const num = (v: number, digits = 2) => v.toFixed(digits);
const positive = (raw: string | undefined): number | null => { const n = Number(raw); return Number.isFinite(n) && n > 0 ? n : null; };

@Injectable()
export class HealthService {
  private cache: { at: number; body: HealthSummary } | null = null;
  private inflight: Promise<HealthSummary> | null = null;

  constructor(
    private readonly data: HealthDataRepository,
    private readonly probes: HealthProbes,
    private readonly clock: Clock,
    @Inject(HEALTH_OPTIONS) private readonly opts: HealthOptions,
  ) {}

  /** Resposta do health, com cache de `cacheMs` (a chamada em andamento é compartilhada). */
  async summary(): Promise<HealthSummary> {
    const now = this.clock.now().getTime();
    if (this.cache && now - this.cache.at < this.opts.cacheMs) return this.cache.body;
    if (!this.inflight) {
      this.inflight = this.build().then((body) => { this.cache = { at: this.clock.now().getTime(), body }; return body; })
        .finally(() => { this.inflight = null; });
    }
    return this.inflight;
  }

  private async build(): Promise<HealthSummary> {
    const checks = await Promise.all([
      this.run("banco", () => this.bancoCheck()),
      this.run("migracoes", () => this.migracoesCheck()),
      this.run("config", async () => this.configCheck()),
      this.run("fal_ai", () => this.falCheck()),
      this.run("r2", () => this.r2Check()),
      this.run("stripe", () => this.stripeCheck()),
      this.run("cron_push", () => this.cronPushCheck()),
      this.run("gestacoes", () => this.gestacoesCheck()),
    ]);
    return {
      app: "GenBreed",
      status: worstStatus(checks.map((c) => c.status)),
      detail: summarizeDetail(checks),
      checked_at: this.clock.now().toISOString(),
      checks,
    };
  }

  /** Roda um check com timeout; estouro → degraded; erro → down. NUNCA repassa a mensagem do erro. */
  private async run(name: string, fn: () => Promise<HealthCheck>): Promise<HealthCheck> {
    try {
      return await withTimeout(fn(), this.opts.timeoutMs);
    } catch (e) {
      if (e instanceof CheckTimeout) return { name, status: "degraded", detail: `não respondeu em ${secondsLabel(this.opts.timeoutMs)}` };
      return { name, status: "down", detail: "falha ao consultar" };
    }
  }

  // ── banco ────────────────────────────────────────────────────────────────────────────────────────────────────────
  private async bancoCheck(): Promise<HealthCheck> {
    await this.data.ping();
    return { name: "banco", status: "ok", detail: "SELECT 1 respondeu" };
  }

  // ── migracoes ────────────────────────────────────────────────────────────────────────────────────────────────────
  private async migracoesCheck(): Promise<HealthCheck> {
    const tags = this.opts.migrationTags();
    if (!tags) return { name: "migracoes", status: "degraded", detail: "arquivos de migração não encontrados no contêiner" };
    const applied = await this.data.appliedMigrations();
    if (applied === tags.length) return { name: "migracoes", status: "ok", detail: `${applied} aplicadas` };
    if (applied < tags.length) {
      const missing = tags.length - applied;
      return { name: "migracoes", status: "down", detail: `${missing} pendente${missing > 1 ? "s" : ""}; primeira: ${tags[applied]}` };
    }
    return { name: "migracoes", status: "degraded", detail: `banco tem ${applied - tags.length} migração(ões) a mais que os arquivos` };
  }

  // ── config (reaproveita as validações de boot; só NOMES de variável, nunca valores) ─────────────────────────────────
  private configCheck(): HealthCheck {
    const env = process.env;
    const missing: string[] = [];
    const invalid: string[] = [];
    if (databaseUrlProblem(env.DATABASE_URL)) invalid.push("DATABASE_URL");
    if (authSecretProblem(env.AUTH_SECRET)) invalid.push("AUTH_SECRET");
    if (!env.FAL_KEY?.trim()) missing.push("FAL_KEY");
    missing.push(...r2Status(env).missing);
    if (!stripeKeyActive(env)) missing.push("STRIPE_SECRET_KEY");
    else for (const p of stripeProductionProblems(env)) (p.kind === "missing" ? missing : invalid).push(p.name);
    if (vapidProblem(env)) invalid.push("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY (só uma definida)");
    if (missing.length === 0 && invalid.length === 0) return { name: "config", status: "ok", detail: "variáveis críticas presentes" };
    const parts = [missing.length ? `faltando: ${missing.join(", ")}` : "", invalid.length ? `inválidas: ${invalid.join(", ")}` : ""].filter(Boolean);
    return { name: "config", status: "down", detail: parts.join("; ") };
  }

  // ── fal_ai ───────────────────────────────────────────────────────────────────────────────────────────────────────
  private async falCheck(): Promise<HealthCheck> {
    const now = this.clock.now();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const cap = positive(process.env.FAL_MONTHLY_CAP_USD);
    let cost = await this.probes.falMonthCostUsd(monthStart, now);
    let estimated = false;
    let images: number | null = null;
    if (cost === null) {
      // Sem chave ADMIN: não há chamada à fal.ai possível — estima por imagens geradas × preço e NÃO afirma que a fal.ai está no ar.
      const ym = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`;
      images = await this.data.imagesGeneratedSince(monthStart, ym);
      cost = images * (positive(process.env.FAL_IMAGE_COST_USD) ?? DEFAULT_FAL_IMAGE_COST_USD);
      estimated = true;
    }
    const capText = cap === null ? "teto não configurado (FAL_MONTHLY_CAP_USD)" : `${num((cost / cap) * 100, 0)}% do teto de US$ ${num(cap)}`;
    const base = estimated
      ? `sem FAL_ADMIN_KEY: fal.ai não verificada; custo estimado do mês US$ ${num(cost)} (${images} imagens)`
      : `custo do mês US$ ${num(cost)}`;
    const overCap = cap !== null && cost >= cap * 0.8;
    const status: HealthStatus = estimated || overCap ? "degraded" : "ok";
    return { name: "fal_ai", status, detail: `${base}; ${capText}` };
  }

  // ── r2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  private async r2Check(): Promise<HealthCheck> {
    if (!this.probes.r2Configured()) return { name: "r2", status: "ok", detail: "R2 não configurado (armazenamento local / modo procedural)" };
    await this.probes.r2Ping();
    const bytes = this.probes.r2OccupancyBytes(this.clock.now());
    const capGb = positive(process.env.R2_STORAGE_CAP_GB);
    if (bytes === null) return { name: "r2", status: "ok", detail: "listagem respondeu; ocupação sendo medida" };
    const usedGb = bytes / GB;
    if (capGb === null) return { name: "r2", status: "ok", detail: `ocupação ${num(usedGb)} GB; teto não configurado (R2_STORAGE_CAP_GB)` };
    const pct = (usedGb / capGb) * 100;
    return { name: "r2", status: pct >= 80 ? "degraded" : "ok", detail: `ocupação ${num(usedGb)} GB (${num(pct, 0)}% de ${num(capGb, 0)} GB)` };
  }

  // ── stripe ───────────────────────────────────────────────────────────────────────────────────────────────────────
  private async stripeCheck(): Promise<HealthCheck> {
    if (!stripeKeyActive(process.env)) return { name: "stripe", status: "degraded", detail: "não configurado (billing desligado)" };
    await this.probes.stripePing();
    const [subs, last] = await Promise.all([this.data.activeSubscriptions(), this.data.lastBillingEventAt()]);
    const silenceH = positive(process.env.STRIPE_WEBHOOK_MAX_SILENCE_HOURS) ?? 24;
    if (!last) return { name: "stripe", status: "degraded", detail: `${subs} assinaturas ativas; nenhum evento de cobrança registrado` };
    const ageH = (this.clock.now().getTime() - last.getTime()) / HOUR_MS;
    return {
      name: "stripe",
      status: ageH > silenceH ? "degraded" : "ok",
      detail: `${subs} assinaturas ativas; último evento há ${num(Math.max(0, ageH), ageH < 10 ? 1 : 0)}h`,
    };
  }

  // ── cron_push ────────────────────────────────────────────────────────────────────────────────────────────────────
  // `push:dispatch` NÃO registra que rodou (ADR-0039): a execução é INFERIDA pela gestação vencida mais antiga que ainda não foi avisada. O cron
  // deveria ter reivindicado toda gestação vencida em até 5 min (+ folga); acima do limite → degraded, acima do dobro → down. Sem gestação vencida
  // pendente não há como confirmar a execução (o check diz isso).
  private async cronPushCheck(): Promise<HealthCheck> {
    if (!isPushEnabled()) return { name: "cron_push", status: "ok", detail: "push desligado (sem VAPID)" };
    const now = this.clock.now();
    const limitMin = CRON_PUSH_INTERVAL_MIN + CRON_PUSH_SLACK_MIN;
    const { oldestEndsAt } = await this.data.overdueUnnotified(now, 0);
    if (!oldestEndsAt) return { name: "cron_push", status: "ok", detail: "sem gestação vencida aguardando aviso (execução inferida, não registrada)" };
    const ageMin = Math.floor((now.getTime() - oldestEndsAt.getTime()) / 60_000);
    const status: HealthStatus = ageMin <= limitMin ? "ok" : ageMin <= limitMin * 2 ? "degraded" : "down";
    return { name: "cron_push", status, detail: `gestação vencida sem aviso há ${ageMin} min (limite ${limitMin} min)` };
  }

  // ── gestacoes ────────────────────────────────────────────────────────────────────────────────────────────────────
  private async gestacoesCheck(): Promise<HealthCheck> {
    if (!isPushEnabled()) return { name: "gestacoes", status: "ok", detail: "push desligado (sem VAPID)" };
    const { count } = await this.data.overdueUnnotified(this.clock.now(), 24 * HOUR_MS);
    if (count === 0) return { name: "gestacoes", status: "ok", detail: "nenhuma gestação vencida há +24h sem aviso" };
    return { name: "gestacoes", status: "degraded", detail: `${count} gestação(ões) vencida(s) há +24h sem aviso` };
  }
}
