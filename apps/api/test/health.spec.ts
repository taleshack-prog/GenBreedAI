/**
 * Health check central (ADR-0039) — `GET /api/v1/health/summary`. HTTP via um módulo de teste com fakes (banco/sondas), sem rede e sem `main.ts`
 * (não carrega o `.env` local). Cobre: token ausente/errado, MONITOR_TOKEN não definido, banco fora, check que estoura o timeout, caminho feliz, cache,
 * limites de cada check e a garantia de que NENHUM segredo aparece no corpo.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Clock, SystemClock } from "../src/common/clock";
import { ClockModule } from "../src/common/clock.module";
import { HealthController } from "../src/health/health.controller";
import { HealthService, HEALTH_OPTIONS, type HealthOptions } from "../src/health/health.service";
import { HealthDataRepository, InMemoryHealthDataRepository, type InMemoryHealthValues } from "../src/health/health-data.repository";
import { HealthProbes } from "../src/health/health-probes";
import { isValidBearer } from "../src/health/health-auth";
import { summarizeDetail, worstStatus, type HealthSummary } from "../src/health/health.types";

// ── ambiente ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SECRETS: Record<string, string> = {
  DATABASE_URL: "postgresql://usuario-db:SENHA-DO-BANCO-9x@banco.exemplo.internal:5432/genbreed",
  AUTH_SECRET: "9f2c4b7a1e8d3c6b5a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b",
  FAL_KEY: "fal-CHAVE-SECRETA-77",
  FAL_ADMIN_KEY: "fal-ADMIN-SECRETA-88",
  R2_ACCOUNT_ID: "conta-r2-SECRETA", R2_ACCESS_KEY_ID: "acesso-r2-SECRETO", R2_SECRET_ACCESS_KEY: "segredo-r2-SECRETO",
  R2_BUCKET: "bucket-SECRETO", R2_PUBLIC_URL: "https://img.exemplo-SECRETO.com.br",
  STRIPE_SECRET_KEY: "sk_live_SEGREDO_STRIPE", STRIPE_WEBHOOK_SECRET: "whsec_SEGREDO_WEBHOOK",
  STRIPE_SUCCESS_URL: "https://genbreed.com.br/app/profile?billing=success", STRIPE_CANCEL_URL: "https://genbreed.com.br/app/profile?billing=cancel",
  VAPID_PUBLIC_KEY: "vapid-PUBLICA-SECRETA", VAPID_PRIVATE_KEY: "vapid-PRIVADA-SECRETA",
  MONITOR_TOKEN: "token-do-monitor-SECRETO-123",
};
const ENV_KEYS = [...Object.keys(SECRETS), "FAL_MONTHLY_CAP_USD", "FAL_IMAGE_COST_USD", "R2_STORAGE_CAP_GB", "STRIPE_WEBHOOK_MAX_SILENCE_HOURS", "NODE_ENV"];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, SECRETS, { NODE_ENV: "test" });
});
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

// ── fakes ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const NOW = new Date("2026-09-24T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const TAGS = ["0000_a", "0001_b", "0002_c"];

class FakeProbes extends HealthProbes {
  calls = { stripe: 0, fal: 0, r2: 0 };
  falCost: number | null = 5;
  r2Bytes: number | null = 2 * 1024 ** 3;
  r2Up = true;
  stripeImpl: () => Promise<void> = async () => {};
  falImpl: (() => Promise<number | null>) | null = null;
  async falMonthCostUsd(): Promise<number | null> { this.calls.fal++; return this.falImpl ? this.falImpl() : this.falCost; }
  r2Configured(): boolean { return true; }
  async r2Ping(): Promise<void> { this.calls.r2++; if (!this.r2Up) throw new Error("R2 fora: conta-r2-SECRETA"); }
  r2OccupancyBytes(): number | null { return this.r2Bytes; }
  async stripePing(): Promise<void> { this.calls.stripe++; return this.stripeImpl(); }
}

class FixedClock extends Clock {
  constructor(public at: Date) { super(); }
  now(): Date { return new Date(this.at.getTime()); }
}

const happyValues = (): Partial<InMemoryHealthValues> => ({ applied: TAGS.length, activeSubscriptions: 3, lastBillingEventAt: hoursAgo(2), images: 40 });
const options = (over: Partial<HealthOptions> = {}): HealthOptions => ({ timeoutMs: 2000, cacheMs: 30_000, migrationTags: () => TAGS, ...over });

function service(values: Partial<InMemoryHealthValues> = happyValues(), probes = new FakeProbes(), over: Partial<HealthOptions> = {}, ping?: () => Promise<void>) {
  const data = new InMemoryHealthDataRepository(values, ping);
  return { svc: new HealthService(data, probes, new FixedClock(NOW), options(over)), probes };
}
const check = (s: HealthSummary, name: string) => s.checks.find((c) => c.name === name)!;

// ── HTTP ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const apps: NestFastifyApplication[] = [];
afterAll(async () => { for (const a of apps) await a.close(); });

async function httpApp(data: HealthDataRepository, probes: HealthProbes, opts: HealthOptions = options()) {
  @Module({
    imports: [ClockModule],
    controllers: [HealthController],
    providers: [
      { provide: HealthDataRepository, useValue: data }, { provide: HealthProbes, useValue: probes },
      { provide: HEALTH_OPTIONS, useValue: opts }, HealthService,
    ],
  })
  class TestHealthModule {}
  const app = await NestFactory.create<NestFastifyApplication>(TestHealthModule, new FastifyAdapter(), { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  return app;
}
const URL_SUMMARY = "/api/v1/health/summary";
// `SECRETS[...]` é `string | undefined` com `noUncheckedIndexedAccess`; o token do teste é constante e sempre existe.
const MONITOR = SECRETS.MONITOR_TOKEN as string;
/** Cabeçalho `Authorization: Bearer …` (sempre com valor string). O caso "sem cabeçalho" NÃO usa isto: chama `get(app)` e omite a chave. */
const bearer = (t: string = MONITOR): Record<string, string> => ({ authorization: `Bearer ${t}` });
const get = (app: NestFastifyApplication, headers: Record<string, string> = {}) => app.inject({ method: "GET", url: URL_SUMMARY, headers });

describe("autenticação", () => {
  it("sem cabeçalho Authorization → 401, SEM corpo", async () => {
    const app = await httpApp(new InMemoryHealthDataRepository(happyValues()), new FakeProbes());
    const res = await get(app);
    expect(res.statusCode).toBe(401);
    expect(res.payload).toBe("");
  });

  it("token errado (ou esquema errado, ou vazio) → 401, SEM corpo explicativo", async () => {
    const app = await httpApp(new InMemoryHealthDataRepository(happyValues()), new FakeProbes());
    const wrong: Record<string, string>[] = [
      bearer("token-errado"), bearer(MONITOR + "x"), { authorization: `Basic ${MONITOR}` }, { authorization: "Bearer " }, { authorization: MONITOR },
    ];
    for (const headers of wrong) {
      const res = await get(app, headers);
      expect(res.statusCode, JSON.stringify(headers)).toBe(401);
      expect(res.payload).toBe("");
    }
  });

  it("MONITOR_TOKEN NÃO definido (ou vazio) → 503, com ou sem cabeçalho — nunca libera por omissão", async () => {
    const app = await httpApp(new InMemoryHealthDataRepository(happyValues()), new FakeProbes());
    for (const value of [undefined, ""]) {
      if (value === undefined) delete process.env.MONITOR_TOKEN; else process.env.MONITOR_TOKEN = value;
      const variants: Record<string, string>[] = [{}, bearer("qualquer"), bearer("")];
      for (const headers of variants) {
        const res = await get(app, headers);
        expect(res.statusCode).toBe(503);
        expect(res.payload).toBe("");
      }
    }
  });

  it("isValidBearer: aceita só 'Bearer <token exato>'; compara em TEMPO CONSTANTE (timingSafeEqual sobre SHA-256)", () => {
    expect(isValidBearer("Bearer abc", "abc")).toBe(true);
    expect(isValidBearer("bearer abc", "abc")).toBe(true);
    expect(isValidBearer(undefined, "abc")).toBe(false);
    expect(isValidBearer("Bearer abcd", "abc")).toBe(false);
    expect(isValidBearer("Bearer ab", "abc")).toBe(false);
    expect(isValidBearer("Token abc", "abc")).toBe(false);
    expect(isValidBearer("Bearer a b", "abc")).toBe(false);
    const src = readFileSync(fileURLToPath(new URL("../src/health/health-auth.ts", import.meta.url)), "utf8");
    expect(src).toContain("timingSafeEqual");
    expect(src).not.toMatch(/===\s*expectedToken|expectedToken\s*===/); // nunca compara o token com ===
  });
});

describe("resposta", () => {
  it("CAMINHO FELIZ: 200, status ok, detail vazio, 8 checks ok, formato exato e Cache-Control: no-store", async () => {
    const app = await httpApp(new InMemoryHealthDataRepository(happyValues()), new FakeProbes());
    const res = await get(app, bearer());
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = res.json() as HealthSummary;
    // Contrato EXATO, sem depender da ORDEM das chaves: o conjunto tem que ser igual (chave a mais ou a menos falha).
    expect(new Set(Object.keys(body))).toEqual(new Set(["app", "status", "detail", "checked_at", "checks"]));
    expect(body.app).toBe("GenBreed");
    expect(body.status).toBe("ok");
    expect(body.detail).toBe("");
    expect(body.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(body.checks.map((c) => c.name)).toEqual(["banco", "migracoes", "config", "fal_ai", "r2", "stripe", "cron_push", "gestacoes"]);
    for (const c of body.checks) {
      expect(new Set(Object.keys(c)), c.name).toEqual(new Set(["name", "status", "detail"]));
      expect(c.status, `${c.name}: ${c.detail}`).toBe("ok");
    }
  });

  it("BANCO FORA: HTTP 200 (a rota não quebra), status down, banco down — e a mensagem do erro (com a senha) NUNCA vai para o corpo", async () => {
    const ping = async () => { throw new Error(`connect ECONNREFUSED ${SECRETS.DATABASE_URL}`); };
    const app = await httpApp(new InMemoryHealthDataRepository(happyValues(), ping), new FakeProbes());
    const res = await get(app, bearer());
    expect(res.statusCode).toBe(200);
    const body = res.json() as HealthSummary;
    expect(body.status).toBe("down");
    expect(check(body, "banco")).toEqual({ name: "banco", status: "down", detail: "falha ao consultar" });
    expect(body.detail).toContain("banco:");
    expect(res.payload).not.toContain("SENHA-DO-BANCO");
    expect(res.payload).not.toContain("ECONNREFUSED");
  });

  it("um check que ESTOURA o timeout vira degraded ('não respondeu em …s'), sem derrubar a resposta nem os outros checks", async () => {
    const probes = new FakeProbes();
    probes.stripeImpl = () => new Promise<void>(() => { /* nunca responde */ });
    const app = await httpApp(new InMemoryHealthDataRepository(happyValues()), probes, options({ timeoutMs: 50 }));
    const t0 = Date.now();
    const res = await get(app, bearer());
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(res.statusCode).toBe(200);
    const body = res.json() as HealthSummary;
    expect(check(body, "stripe")).toEqual({ name: "stripe", status: "degraded", detail: "não respondeu em 0.05s" });
    expect(body.status).toBe("degraded");
    for (const name of ["banco", "migracoes", "config", "fal_ai", "r2", "cron_push", "gestacoes"]) expect(check(body, name).status, name).toBe("ok");
  });

  it("NENHUM SEGREDO no corpo — nem no caminho feliz, nem com tudo falhando (chaves, string de conexão, tokens, URLs, e-mail)", async () => {
    const probes = new FakeProbes();
    probes.r2Up = false;
    probes.stripeImpl = async () => { throw new Error("Invalid API Key: sk_live_SEGREDO_STRIPE"); };
    probes.falImpl = async () => { throw new Error("401 Key fal-ADMIN-SECRETA-88"); };
    for (const [data, p] of [[new InMemoryHealthDataRepository(happyValues()), new FakeProbes()],
      [new InMemoryHealthDataRepository(happyValues(), async () => { throw new Error(SECRETS.DATABASE_URL); }), probes]] as const) {
      const app = await httpApp(data, p);
      const res = await get(app, bearer());
      expect(res.statusCode).toBe(200);
      for (const secret of Object.values(SECRETS)) expect(res.payload, `vazou ${secret.slice(0, 12)}…`).not.toContain(secret);
      expect(res.payload).not.toMatch(/SECRETA|SECRETO|SEGREDO|SENHA|@banco|usuario-db|sk_live|whsec_|Bearer/);
      expect(res.payload).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // nenhum e-mail
    }
  });

  it("CACHE de 30s: duas chamadas seguidas fazem UMA rodada de sondas; passados 30s, roda de novo", async () => {
    const probes = new FakeProbes();
    const data = new InMemoryHealthDataRepository(happyValues());
    const app = await httpApp(data, probes);
    const clock = app.get(SystemClock);
    try {
      clock.setForTesting(NOW);
      await get(app, bearer()); await get(app, bearer());
      expect(probes.calls.stripe).toBe(1);
      clock.setForTesting(new Date(NOW.getTime() + 29_000));
      await get(app, bearer());
      expect(probes.calls.stripe).toBe(1);
      clock.setForTesting(new Date(NOW.getTime() + 31_000));
      await get(app, bearer());
      expect(probes.calls.stripe).toBe(2);
    } finally { clock.setForTesting(null); }
  });

  it("requisições simultâneas compartilham a MESMA rodada (não multiplicam chamadas)", async () => {
    const probes = new FakeProbes();
    const { svc } = service(happyValues(), probes);
    await Promise.all([svc.summary(), svc.summary(), svc.summary()]);
    expect(probes.calls.stripe).toBe(1);
  });
});

describe("limites de cada check", () => {
  it("migracoes: aplicadas == arquivos → ok; faltando → down com quantas e a primeira; banco à frente → degraded; journal ausente → degraded", async () => {
    expect(check(await service({ applied: 3 }).svc.summary(), "migracoes")).toMatchObject({ status: "ok", detail: "3 aplicadas" });
    expect(check(await service({ applied: 1 }).svc.summary(), "migracoes")).toEqual({ name: "migracoes", status: "down", detail: "2 pendentes; primeira: 0001_b" });
    expect(check(await service({ applied: 2 }).svc.summary(), "migracoes")).toMatchObject({ status: "down", detail: "1 pendente; primeira: 0002_c" });
    expect(check(await service({ applied: 5 }).svc.summary(), "migracoes").status).toBe("degraded");
    expect(check(await service({ applied: 3 }, new FakeProbes(), { migrationTags: () => null }).svc.summary(), "migracoes").status).toBe("degraded");
  });

  it("migracoes: o journal REAL do repositório é legível (16+ migrações, em ordem)", async () => {
    const { readMigrationTags } = await import("../src/health/health.service");
    const tags = readMigrationTags();
    expect(tags).not.toBeNull();
    expect(tags!.length).toBeGreaterThanOrEqual(16);
    expect(tags![0]).toMatch(/^0000_/);
  });

  it("config: ok com tudo; faltando/ inválida → down listando só NOMES", async () => {
    expect(check(await service().svc.summary(), "config")).toMatchObject({ status: "ok" });
    delete process.env.FAL_KEY; delete process.env.R2_BUCKET; process.env.AUTH_SECRET = "curto"; delete process.env.STRIPE_WEBHOOK_SECRET;
    const c = check(await service().svc.summary(), "config");
    expect(c.status).toBe("down");
    expect(c.detail).toBe("faltando: FAL_KEY, R2_BUCKET, STRIPE_WEBHOOK_SECRET; inválidas: AUTH_SECRET");
    expect(c.detail).not.toContain("curto");
  });

  it("fal_ai: custo do mês no detail; ≥ 80% do teto → degraded; sem teto → ok com aviso; sem FAL_ADMIN_KEY → degraded com estimativa", async () => {
    const probes = new FakeProbes();
    probes.falCost = 12.346;
    expect(check(await service(happyValues(), probes).svc.summary(), "fal_ai")).toEqual({
      name: "fal_ai", status: "ok", detail: "custo do mês US$ 12.35; teto não configurado (FAL_MONTHLY_CAP_USD)" });
    process.env.FAL_MONTHLY_CAP_USD = "100";
    expect(check(await service(happyValues(), probes).svc.summary(), "fal_ai")).toMatchObject({ status: "ok", detail: "custo do mês US$ 12.35; 12% do teto de US$ 100.00" });
    probes.falCost = 80;
    expect(check(await service(happyValues(), probes).svc.summary(), "fal_ai").status).toBe("degraded");
    probes.falCost = 79.99;
    expect(check(await service(happyValues(), probes).svc.summary(), "fal_ai").status).toBe("ok");
    // sem chave admin: `falMonthCostUsd` → null; estimativa 40 imagens × US$ 0,03
    probes.falCost = null;
    const est = check(await service(happyValues(), probes).svc.summary(), "fal_ai");
    expect(est.status).toBe("degraded");
    expect(est.detail).toContain("sem FAL_ADMIN_KEY");
    expect(est.detail).toContain("US$ 1.20 (40 imagens)");
  });

  it("fal_ai fora (erro) → down", async () => {
    const probes = new FakeProbes();
    probes.falImpl = async () => { throw new Error("HTTP 503"); };
    expect(check(await service(happyValues(), probes).svc.summary(), "fal_ai")).toEqual({ name: "fal_ai", status: "down", detail: "falha ao consultar" });
  });

  it("r2: ocupação no detail; ≥ 80% do teto → degraded; fora → down", async () => {
    const probes = new FakeProbes();
    expect(check(await service(happyValues(), probes).svc.summary(), "r2").detail).toBe("ocupação 2.00 GB; teto não configurado (R2_STORAGE_CAP_GB)");
    process.env.R2_STORAGE_CAP_GB = "10";
    expect(check(await service(happyValues(), probes).svc.summary(), "r2")).toMatchObject({ status: "ok", detail: "ocupação 2.00 GB (20% de 10 GB)" });
    probes.r2Bytes = 8 * 1024 ** 3;
    expect(check(await service(happyValues(), probes).svc.summary(), "r2").status).toBe("degraded");
    probes.r2Bytes = null;
    expect(check(await service(happyValues(), probes).svc.summary(), "r2").detail).toContain("sendo medida");
    probes.r2Up = false;
    expect(check(await service(happyValues(), probes).svc.summary(), "r2")).toEqual({ name: "r2", status: "down", detail: "falha ao consultar" });
  });

  it("stripe: API responde → ok com assinaturas e último evento; sem evento há +24h → degraded; sem evento nenhum → degraded; API fora → down", async () => {
    expect(check(await service(happyValues()).svc.summary(), "stripe")).toEqual({ name: "stripe", status: "ok", detail: "3 assinaturas ativas; último evento há 2.0h" });
    const stale = check(await service({ ...happyValues(), lastBillingEventAt: hoursAgo(25) }).svc.summary(), "stripe");
    expect(stale.status).toBe("degraded");
    expect(stale.detail).toBe("3 assinaturas ativas; último evento há 25h");
    expect(check(await service({ ...happyValues(), lastBillingEventAt: null }).svc.summary(), "stripe").status).toBe("degraded");
    const probes = new FakeProbes();
    probes.stripeImpl = async () => { throw new Error("401"); };
    expect(check(await service(happyValues(), probes).svc.summary(), "stripe")).toEqual({ name: "stripe", status: "down", detail: "falha ao consultar" });
  });

  it("cron_push (inferido pela gestação vencida mais antiga sem aviso): ≤ 8 min ok; até 16 min degraded; acima do dobro down; nenhuma pendente → ok", async () => {
    const run = async (min: number | null) => check(await service({ ...happyValues(), overdue: min === null ? { count: 0, oldestEndsAt: null } : { count: 1, oldestEndsAt: minutesAgo(min) } }).svc.summary(), "cron_push");
    expect((await run(null)).status).toBe("ok");
    expect((await run(3)).status).toBe("ok");
    expect((await run(8)).status).toBe("ok");
    expect((await run(9)).status).toBe("degraded");
    expect((await run(16)).status).toBe("degraded");
    const down = await run(17);
    expect(down.status).toBe("down");
    expect(down.detail).toBe("gestação vencida sem aviso há 17 min (limite 8 min)");
  });

  it("gestacoes: zero vencidas há +24h → ok; qualquer uma → degraded com a contagem", async () => {
    expect(check(await service({ ...happyValues(), overdue: { count: 2, oldestEndsAt: hoursAgo(3) } }).svc.summary(), "gestacoes").status).toBe("ok");
    const c = check(await service({ ...happyValues(), overdue: { count: 4, oldestEndsAt: hoursAgo(30) } }).svc.summary(), "gestacoes");
    expect(c).toEqual({ name: "gestacoes", status: "degraded", detail: "4 gestação(ões) vencida(s) há +24h sem aviso" });
  });

  it("push desligado (sem VAPID): cron_push e gestacoes ficam ok (o cron não reivindica nada de propósito)", async () => {
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    const s = await service({ ...happyValues(), overdue: { count: 5, oldestEndsAt: hoursAgo(48) } }).svc.summary();
    expect(check(s, "cron_push").status).toBe("ok");
    expect(check(s, "gestacoes").status).toBe("ok");
  });
});

describe("status do topo e detail", () => {
  it("o topo é o PIOR entre os checks; detail resume só o que não está ok", async () => {
    const s = await service({ ...happyValues(), applied: 1, overdue: { count: 2, oldestEndsAt: hoursAgo(30) } }).svc.summary();
    expect(s.status).toBe("down");
    expect(s.detail).toContain("migracoes: 2 pendentes; primeira: 0001_b");
    expect(s.detail).toContain("gestacoes: 2 gestação(ões)");
    expect(s.detail).not.toContain("banco");
  });

  it("worstStatus e summarizeDetail: ordem ok < degraded < down; detail com no máximo 200 caracteres", () => {
    expect(worstStatus([])).toBe("ok");
    expect(worstStatus(["ok", "degraded", "ok"])).toBe("degraded");
    expect(worstStatus(["degraded", "down", "ok"])).toBe("down");
    const long = Array.from({ length: 8 }, (_, i) => ({ name: `check_${i}`, status: "down" as const, detail: "x".repeat(60) }));
    const d = summarizeDetail(long);
    expect(d.length).toBeLessThanOrEqual(200);
    expect(d.endsWith("…")).toBe(true);
    expect(summarizeDetail([{ name: "a", status: "ok", detail: "tudo certo" }])).toBe("");
  });

  it("orçamento: timeout individual de 2s por padrão, checks em paralelo (≤ 6s no total por construção)", async () => {
    const { DEFAULT_HEALTH_OPTIONS } = await import("../src/health/health.service");
    expect(DEFAULT_HEALTH_OPTIONS.timeoutMs).toBe(2000);
    expect(DEFAULT_HEALTH_OPTIONS.cacheMs).toBe(30_000);
    const probes = new FakeProbes();
    probes.stripeImpl = () => new Promise<void>(() => {});
    probes.falImpl = () => new Promise<number | null>(() => {});
    const t0 = Date.now();
    await service(happyValues(), probes, { timeoutMs: 80 }).svc.summary();
    expect(Date.now() - t0).toBeLessThan(500); // dois checks pendurados não somam tempo: rodam juntos
  });
});
