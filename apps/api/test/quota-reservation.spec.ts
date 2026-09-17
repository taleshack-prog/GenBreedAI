/**
 * ADR-0020: `QuotaService` passou a servir DOIS contadores independentes
 * (`kind`): "cross_hourly" (limite TÉCNICO de 60/hora em POST /cross, igual
 * pra todo tier — QuotaGuard) e "reveal" (cota de REVELAÇÃO por tier,
 * rolling7d/day — era a cota de cruzamento da ADR-0019, mesmos valores,
 * cobrada agora em POST /incubator/:id/reveal). Reserva atômica
 * (QuotaGuard/IncubatorService → QuotaService.reserve), confirmação no
 * sucesso e estorno na falha. QuotaService é REAL (equivalente em memória,
 * sem DATABASE_URL); CrossService é FALSO (mock) — sem motor, sem
 * repositório, sem DB. O caso "61 cruzamentos numa hora → 429" fim-a-fim
 * (com o motor de verdade) está em `cross.e2e.spec.ts`; aqui é só o
 * contrato de reserva/confirmação/estorno + a aritmética das janelas.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { BadRequestException, NotFoundException, HttpException, ExecutionContext } from "@nestjs/common";
import type { Tier } from "@genbreedai/shared";
import { CrossController } from "../src/cross/cross.controller";
import { CrossService } from "../src/cross/cross.service";
import { IncubatorRepository } from "../src/incubator/in-memory.repository";
import { QuotaGuard, type CrossReservedRequest } from "../src/quota/quota.guard";
import { QuotaService } from "../src/quota/quota.service";
import { isQuotaUnlimitedDev, resetQuotaUnlimitedDevWarnings } from "../src/quota/quota-unlimited-dev";
import { TierService } from "../src/billing/tier.service";
import type { CrossDto } from "../src/cross/dto/cross.dto";

/** Contexto Nest mínimo (guard) + objeto `req` reaproveitado pelo controller (crossReservationId fica nele). */
function makeContext(userId: string): { ctx: ExecutionContext; req: CrossReservedRequest } {
  const req = { user: { id: userId, tier: "FREE" as Tier } } as unknown as CrossReservedRequest;
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { ctx, req };
}

const DTO: CrossDto = { sireId: "s", damId: "d", method: "F1" } as CrossDto;
/** `incubate()` "vazio" — as testes deste arquivo checam só o contrato de cota, não descrições de verdade. */
const EMPTY_INCUBATE = { crossId: "cx1", sireId: "s", damId: "d", method: "F1" as const, pack: "feline", species: "s", entries: [] };

function tierServiceFor(t: Tier): TierService {
  return { resolve: async () => t } as unknown as TierService;
}
function fakeIncubatorRepo(): IncubatorRepository {
  return { create: vi.fn().mockResolvedValue({}) } as unknown as IncubatorRepository;
}

describe("Limite técnico horário de POST /cross (ADR-0020) — QuotaGuard + CrossController", () => {
  let quota: QuotaService;
  let tier: TierService;
  let originalUnlimitedDev: string | undefined;
  let originalCrossUnlimited: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalUnlimitedDev = process.env.QUOTA_UNLIMITED_DEV;
    originalCrossUnlimited = process.env.CROSS_QUOTA_UNLIMITED;
    originalNodeEnv = process.env.NODE_ENV;
    delete process.env.QUOTA_UNLIMITED_DEV;
    delete process.env.CROSS_QUOTA_UNLIMITED;
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "test";
    resetQuotaUnlimitedDevWarnings();
    quota = new QuotaService();
    quota.resetAll();
    tier = tierServiceFor("FREE"); // hourlyCrossLimit é igual (60) pra todo tier
  });

  afterEach(() => {
    quota.resetAll();
    vi.useRealTimers();
    if (originalUnlimitedDev === undefined) delete process.env.QUOTA_UNLIMITED_DEV;
    else process.env.QUOTA_UNLIMITED_DEV = originalUnlimitedDev;
    if (originalCrossUnlimited === undefined) delete process.env.CROSS_QUOTA_UNLIMITED;
    else process.env.CROSS_QUOTA_UNLIMITED = originalCrossUnlimited;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  function makeController(incubate: CrossService["incubate"]) {
    const service = { incubate } as unknown as CrossService;
    const incubator = fakeIncubatorRepo();
    const guard = new QuotaGuard(quota, tier);
    const controller = new CrossController(service, tier, quota, incubator);
    return { service, incubator, guard, controller };
  }

  it("sucesso → reserva confirmada (kind cross_hourly)", async () => {
    const { guard, controller } = makeController(vi.fn().mockResolvedValue(EMPTY_INCUBATE));
    const { ctx, req } = makeContext("u1");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await controller.create({ id: "u1", tier: "FREE" }, DTO, req);
    expect(await quota.used("cross_hourly", "u1", { limit: 60, window: "hour" })).toBe(1);
  });

  it("service lança BadRequestException → reserva estornada (não conta)", async () => {
    const { guard, controller } = makeController(vi.fn().mockRejectedValue(new BadRequestException("ruim")));
    const { ctx, req } = makeContext("u2");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(controller.create({ id: "u2", tier: "FREE" }, DTO, req)).rejects.toThrow(BadRequestException);
    expect(await quota.used("cross_hourly", "u2", { limit: 60, window: "hour" })).toBe(0);
  });

  it("service lança NotFoundException → reserva estornada", async () => {
    const { guard, controller } = makeController(vi.fn().mockRejectedValue(new NotFoundException("não achou")));
    const { ctx, req } = makeContext("u3");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(controller.create({ id: "u3", tier: "FREE" }, DTO, req)).rejects.toThrow(NotFoundException);
    expect(await quota.used("cross_hourly", "u3", { limit: 60, window: "hour" })).toBe(0);
  });

  it("service lança erro genérico → reserva estornada", async () => {
    const { guard, controller } = makeController(vi.fn().mockRejectedValue(new Error("boom")));
    const { ctx, req } = makeContext("u4");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(controller.create({ id: "u4", tier: "FREE" }, DTO, req)).rejects.toThrow("boom");
    expect(await quota.used("cross_hourly", "u4", { limit: 60, window: "hour" })).toBe(0);
  });

  it("duas chamadas concorrentes (bem abaixo do limite 60) → as duas reservam e confirmam, contagem final = 2", async () => {
    // Exaustão real do limite (61ª chamada → 429) é testada fim-a-fim, com
    // o motor de verdade, em cross.e2e.spec.ts — aqui só confirma que duas
    // reservas concorrentes não se atropelam (cada uma ganha seu próprio id).
    const incubate = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return EMPTY_INCUBATE;
    });
    const { guard, controller } = makeController(incubate);
    const userId = "race";

    async function attempt() {
      const { ctx, req } = makeContext(userId);
      await guard.canActivate(ctx);
      return controller.create({ id: userId, tier: "FREE" }, DTO, req);
    }

    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await quota.used("cross_hourly", userId, { limit: 60, window: "hour" })).toBe(2);
  });

  it("QUOTA_UNLIMITED_DEV=true → release não quebra (reserva fictícia, nunca gravada)", async () => {
    process.env.QUOTA_UNLIMITED_DEV = "true";
    await expect(quota.release("cross_hourly", "qualquer-um")).resolves.not.toThrow();
  });
});

/**
 * Renomeação CROSS_QUOTA_UNLIMITED → QUOTA_UNLIMITED_DEV (pedido do dono do
 * produto): nome novo é o principal; o antigo continua aceito por
 * compatibilidade (com aviso de depreciação); em produção a flag é SEMPRE
 * ignorada, com um aviso de log — nunca silenciosamente.
 */
describe("QUOTA_UNLIMITED_DEV (flag de dev, ex-CROSS_QUOTA_UNLIMITED)", () => {
  let originalUnlimitedDev: string | undefined;
  let originalCrossUnlimited: string | undefined;
  let originalNodeEnv: string | undefined;
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    originalUnlimitedDev = process.env.QUOTA_UNLIMITED_DEV;
    originalCrossUnlimited = process.env.CROSS_QUOTA_UNLIMITED;
    originalNodeEnv = process.env.NODE_ENV;
    delete process.env.QUOTA_UNLIMITED_DEV;
    delete process.env.CROSS_QUOTA_UNLIMITED;
    delete process.env.DATABASE_URL;
    resetQuotaUnlimitedDevWarnings();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    if (originalUnlimitedDev === undefined) delete process.env.QUOTA_UNLIMITED_DEV;
    else process.env.QUOTA_UNLIMITED_DEV = originalUnlimitedDev;
    if (originalCrossUnlimited === undefined) delete process.env.CROSS_QUOTA_UNLIMITED;
    else process.env.CROSS_QUOTA_UNLIMITED = originalCrossUnlimited;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("nome novo (QUOTA_UNLIMITED_DEV=true), fora de produção → ativa, sem aviso", () => {
    process.env.NODE_ENV = "test";
    process.env.QUOTA_UNLIMITED_DEV = "true";
    expect(isQuotaUnlimitedDev()).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("nome antigo (CROSS_QUOTA_UNLIMITED=true), fora de produção → ainda ativa (compatibilidade), com aviso de depreciação 1x por processo", () => {
    process.env.NODE_ENV = "test";
    process.env.CROSS_QUOTA_UNLIMITED = "true";
    expect(isQuotaUnlimitedDev()).toBe(true);
    expect(isQuotaUnlimitedDev()).toBe(true); // 2ª chamada — mesmo efeito
    expect(isQuotaUnlimitedDev()).toBe(true); // 3ª chamada
    const deprecationWarnings = warnSpy.mock.calls.filter((c) => String(c[0]).includes("DEPRECIADA"));
    expect(deprecationWarnings.length).toBe(1); // só 1 aviso, não 1 por chamada
  });

  it("NODE_ENV=production + QUOTA_UNLIMITED_DEV=true → a flag é IGNORADA (cota continua valendo), com aviso 1x por processo", () => {
    process.env.NODE_ENV = "production";
    process.env.QUOTA_UNLIMITED_DEV = "true";
    expect(isQuotaUnlimitedDev()).toBe(false);
    expect(isQuotaUnlimitedDev()).toBe(false); // 2ª chamada — continua ignorada
    const ignoredWarnings = warnSpy.mock.calls.filter((c) => String(c[0]).includes("IGNORADA"));
    expect(ignoredWarnings.length).toBe(1); // só 1 aviso, não 1 por chamada
  });

  it("NODE_ENV=production + CROSS_QUOTA_UNLIMITED=true (nome antigo) → também ignorada", () => {
    process.env.NODE_ENV = "production";
    process.env.CROSS_QUOTA_UNLIMITED = "true";
    expect(isQuotaUnlimitedDev()).toBe(false);
  });

  it("item 4 (pedido): NODE_ENV=production + flag ligada → QuotaService.reserve() continua limitando de verdade (fim-a-fim)", async () => {
    process.env.NODE_ENV = "production";
    process.env.QUOTA_UNLIMITED_DEV = "true";
    const quota = new QuotaService();
    const policy = { limit: 1, window: "hour" } as const;
    const id1 = await quota.reserve("cross_hourly", "prod-user", policy);
    expect(id1).not.toBeNull(); // a 1ª reserva de verdade passa (dentro do limite)
    await quota.confirm("cross_hourly", id1!);
    const id2 = await quota.reserve("cross_hourly", "prod-user", policy);
    expect(id2).toBeNull(); // a 2ª estoura o limite — SE a flag estivesse valendo, isto passaria
  });

  it("sem NODE_ENV definido (nem 'production' nem 'test') → flag continua valendo (só produção ignora)", () => {
    delete process.env.NODE_ENV;
    process.env.QUOTA_UNLIMITED_DEV = "true";
    expect(isQuotaUnlimitedDev()).toBe(true);
  });
});

describe("Janelas de cota por kind (ADR-0020) — QuotaService direto, sem controller", () => {
  let quota: QuotaService;

  beforeEach(() => {
    delete process.env.QUOTA_UNLIMITED_DEV;
    delete process.env.CROSS_QUOTA_UNLIMITED;
    delete process.env.DATABASE_URL;
    quota = new QuotaService();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("reveal FREE (1/rolling7d): 1º passa, 2º em seguida → null (429); 7 dias + 1 min depois → passa de novo", async () => {
    const policy = { limit: 1, window: "rolling7d" } as const;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));

    const id1 = await quota.reserve("reveal", "free-user", policy);
    expect(id1).not.toBeNull();
    await quota.confirm("reveal", id1!);

    const id2 = await quota.reserve("reveal", "free-user", policy);
    expect(id2).toBeNull();

    vi.setSystemTime(new Date("2026-01-08T12:01:00Z")); // 7 dias + 1 min depois
    const id3 = await quota.reserve("reveal", "free-user", policy);
    expect(id3).not.toBeNull();
  });

  it("reveal JUNIOR (3/rolling7d): 3 passam, o 4º → null", async () => {
    const policy = { limit: 3, window: "rolling7d" } as const;
    for (let i = 0; i < 3; i++) {
      const id = await quota.reserve("reveal", "junior-user", policy);
      expect(id).not.toBeNull();
      await quota.confirm("reveal", id!);
    }
    expect(await quota.reserve("reveal", "junior-user", policy)).toBeNull();
  });

  it("reveal SENIOR (1/day, America/Sao_Paulo): esgota no dia, libera na virada da meia-noite local", async () => {
    const policy = { limit: 1, window: "day" } as const;
    vi.useFakeTimers();
    // 2026-01-01 23:59 em America/Sao_Paulo (UTC-3) = 2026-01-02T02:59:00Z.
    vi.setSystemTime(new Date("2026-01-02T02:59:00Z"));
    const id1 = await quota.reserve("reveal", "senior-user", policy);
    expect(id1).not.toBeNull();
    await quota.confirm("reveal", id1!);
    expect(await quota.reserve("reveal", "senior-user", policy)).toBeNull();

    // 1 minuto depois já é 2026-01-02T00:00 em São Paulo — outro dia civil.
    vi.setSystemTime(new Date("2026-01-02T03:00:00Z"));
    const id2 = await quota.reserve("reveal", "senior-user", policy);
    expect(id2).not.toBeNull();
  });

  it("reveal PHD (3/day, America/Sao_Paulo): 3 no mesmo dia civil passam, o 4º não", async () => {
    const policy = { limit: 3, window: "day" } as const;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T14:00:00Z")); // meio do dia em São Paulo
    for (let i = 0; i < 3; i++) {
      const id = await quota.reserve("reveal", "phd-user", policy);
      expect(id).not.toBeNull();
      await quota.confirm("reveal", id!);
    }
    expect(await quota.reserve("reveal", "phd-user", policy)).toBeNull();
  });

  it("cross_hourly (60/hour): esgota na hora, libera 1h+1min depois — mesma aritmética de rolling7d, janela menor", async () => {
    const policy = { limit: 2, window: "hour" } as const; // limite pequeno pra não precisar de 60 reservas
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const id1 = await quota.reserve("cross_hourly", "hourly-user", policy);
    const id2 = await quota.reserve("cross_hourly", "hourly-user", policy);
    expect(id1).not.toBeNull(); expect(id2).not.toBeNull();
    await quota.confirm("cross_hourly", id1!); await quota.confirm("cross_hourly", id2!);
    expect(await quota.reserve("cross_hourly", "hourly-user", policy)).toBeNull();

    vi.setSystemTime(new Date("2026-01-01T13:01:00Z")); // 1h + 1min depois
    expect(await quota.reserve("cross_hourly", "hourly-user", policy)).not.toBeNull();
  });

  it("cross_hourly e reveal são contadores INDEPENDENTES pro mesmo dono — esgotar um não afeta o outro", async () => {
    const hourlyPolicy = { limit: 1, window: "hour" } as const;
    const revealPolicy = { limit: 1, window: "rolling7d" } as const;
    const owner = "shared-owner";
    const hid = await quota.reserve("cross_hourly", owner, hourlyPolicy);
    expect(hid).not.toBeNull();
    await quota.confirm("cross_hourly", hid!);
    expect(await quota.reserve("cross_hourly", owner, hourlyPolicy)).toBeNull(); // horário esgotado

    const rid = await quota.reserve("reveal", owner, revealPolicy);
    expect(rid).not.toBeNull(); // reveal continua livre — contador separado
  });

  it("RESERVED com mais de 10 minutos não conta (proteção contra processo morto)", async () => {
    const policy = { limit: 1, window: "rolling7d" } as const;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const id1 = await quota.reserve("reveal", "stale-user", policy);
    expect(id1).not.toBeNull();
    // NUNCA confirmada nem estornada (processo "morreu" no meio) — 11 min depois:
    vi.setSystemTime(new Date("2026-01-01T12:11:00Z"));
    const id2 = await quota.reserve("reveal", "stale-user", policy);
    expect(id2).not.toBeNull(); // a RESERVED velha não contou mais
  });
});
