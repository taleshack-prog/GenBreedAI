/**
 * Cota de cruzamento (ADR-0019) — reserva atômica (QuotaGuard → QuotaService.
 * reserve), confirmação no sucesso e estorno na falha (CrossController).
 * QuotaService é REAL (equivalente em memória, sem DATABASE_URL); CrossService
 * é FALSO (mock) — sem motor, sem repositório, sem DB. Testa só o contrato de
 * reserva/confirmação/estorno + as janelas rolling7d/day.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BadRequestException, NotFoundException, HttpException, ExecutionContext } from "@nestjs/common";
import type { Tier } from "@genbreedai/shared";
import { CrossController } from "../src/cross/cross.controller";
import { CrossService } from "../src/cross/cross.service";
import { QuotaGuard, type CrossReservedRequest } from "../src/quota/quota.guard";
import { QuotaService } from "../src/quota/quota.service";
import { TierService } from "../src/billing/tier.service";
import type { CrossDto } from "../src/cross/dto/cross.dto";

/** Contexto Nest mínimo (guard) + objeto `req` reaproveitado pelo controller (crossReservationId fica nele). */
function makeContext(userId: string): { ctx: ExecutionContext; req: CrossReservedRequest } {
  const req = { user: { id: userId, tier: "FREE" as Tier } } as unknown as CrossReservedRequest;
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { ctx, req };
}

const DTO: CrossDto = { sireId: "s", damId: "d", method: "F1" } as CrossDto;

function tierServiceFor(t: Tier): TierService {
  return { resolve: async () => t } as unknown as TierService;
}

describe("Reserva de cota de cruzamento (ADR-0019) — QuotaGuard + CrossController", () => {
  let quota: QuotaService;
  let tier: TierService;
  let originalUnlimited: string | undefined;

  beforeEach(() => {
    originalUnlimited = process.env.CROSS_QUOTA_UNLIMITED;
    delete process.env.CROSS_QUOTA_UNLIMITED;
    delete process.env.DATABASE_URL;
    quota = new QuotaService();
    quota.resetAll();
    tier = tierServiceFor("FREE");
  });

  afterEach(() => {
    quota.resetAll();
    vi.useRealTimers();
    if (originalUnlimited === undefined) delete process.env.CROSS_QUOTA_UNLIMITED;
    else process.env.CROSS_QUOTA_UNLIMITED = originalUnlimited;
  });

  function makeController(execute: CrossService["execute"]) {
    const service = { execute } as unknown as CrossService;
    const guard = new QuotaGuard(quota, tier);
    const controller = new CrossController(service, tier, quota);
    return { service, guard, controller };
  }

  it("sucesso → reserva confirmada, cota do FREE (limite 1) esgotada", async () => {
    const { guard, controller } = makeController(vi.fn().mockResolvedValue({ specimen: {}, cacheKey: "k", engine: {} }));
    const { ctx, req } = makeContext("u1");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await controller.create({ id: "u1", tier: "FREE" }, DTO, req);
    expect(await quota.used("u1", { limit: 1, window: "rolling7d" })).toBe(1);
  });

  it("service lança BadRequestException → cota intacta (estornada, reserva apagada)", async () => {
    const { guard, controller } = makeController(vi.fn().mockRejectedValue(new BadRequestException("ruim")));
    const { ctx, req } = makeContext("u2");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(controller.create({ id: "u2", tier: "FREE" }, DTO, req)).rejects.toThrow(BadRequestException);
    expect(await quota.used("u2", { limit: 1, window: "rolling7d" })).toBe(0);
  });

  it("service lança NotFoundException → cota intacta (estornada)", async () => {
    const { guard, controller } = makeController(vi.fn().mockRejectedValue(new NotFoundException("não achou")));
    const { ctx, req } = makeContext("u3");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(controller.create({ id: "u3", tier: "FREE" }, DTO, req)).rejects.toThrow(NotFoundException);
    expect(await quota.used("u3", { limit: 1, window: "rolling7d" })).toBe(0);
  });

  it("service lança erro genérico → cota intacta (estornada)", async () => {
    const { guard, controller } = makeController(vi.fn().mockRejectedValue(new Error("boom")));
    const { ctx, req } = makeContext("u4");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(controller.create({ id: "u4", tier: "FREE" }, DTO, req)).rejects.toThrow("boom");
    expect(await quota.used("u4", { limit: 1, window: "rolling7d" })).toBe(0);
  });

  it("corrida: limite 1, duas chamadas simultâneas → exatamente 1 sucesso e 1 HTTP 429; contagem final = 1", async () => {
    // Service falso com um "tick" de espera — simula I/O real, dando espaço
    // pra corrida se a reserva NÃO fosse atômica/síncrona no guard.
    const execute = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { specimen: {}, cacheKey: "k", engine: {} };
    });
    const { guard, controller } = makeController(execute);
    const userId = "race";

    async function attempt() {
      const { ctx, req } = makeContext(userId);
      await guard.canActivate(ctx); // lança HttpException 429 se a cota já foi consumida
      return controller.create({ id: userId, tier: "FREE" }, DTO, req);
    }

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0]!.reason).toBeInstanceOf(HttpException);
    expect((rejected[0]!.reason as HttpException).getStatus()).toBe(429);
    expect(await quota.used(userId, { limit: 1, window: "rolling7d" })).toBe(1);
  });

  it("CROSS_QUOTA_UNLIMITED=true → release não quebra (reserva fictícia, nunca gravada)", async () => {
    process.env.CROSS_QUOTA_UNLIMITED = "true";
    await expect(quota.release("qualquer-um")).resolves.not.toThrow();
  });
});

describe("Janelas de cota por tier (ADR-0019) — QuotaService direto, sem controller", () => {
  let quota: QuotaService;

  beforeEach(() => {
    delete process.env.CROSS_QUOTA_UNLIMITED;
    delete process.env.DATABASE_URL;
    quota = new QuotaService();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("FREE (1/rolling7d): 1º passa, 2º em seguida → null (429); 7 dias + 1 min depois → passa de novo", async () => {
    const policy = { limit: 1, window: "rolling7d" } as const;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));

    const id1 = await quota.reserve("free-user", policy);
    expect(id1).not.toBeNull();
    await quota.confirm(id1!);

    const id2 = await quota.reserve("free-user", policy);
    expect(id2).toBeNull();

    vi.setSystemTime(new Date("2026-01-08T12:01:00Z")); // 7 dias + 1 min depois
    const id3 = await quota.reserve("free-user", policy);
    expect(id3).not.toBeNull();
  });

  it("JUNIOR (3/rolling7d): 3 passam, o 4º → null", async () => {
    const policy = { limit: 3, window: "rolling7d" } as const;
    for (let i = 0; i < 3; i++) {
      const id = await quota.reserve("junior-user", policy);
      expect(id).not.toBeNull();
      await quota.confirm(id!);
    }
    expect(await quota.reserve("junior-user", policy)).toBeNull();
  });

  it("SENIOR (1/day, America/Sao_Paulo): esgota no dia, libera na virada da meia-noite local", async () => {
    const policy = { limit: 1, window: "day" } as const;
    vi.useFakeTimers();
    // 2026-01-01 23:59 em America/Sao_Paulo (UTC-3) = 2026-01-02T02:59:00Z.
    vi.setSystemTime(new Date("2026-01-02T02:59:00Z"));
    const id1 = await quota.reserve("senior-user", policy);
    expect(id1).not.toBeNull();
    await quota.confirm(id1!);
    expect(await quota.reserve("senior-user", policy)).toBeNull();

    // 1 minuto depois já é 2026-01-02T00:00 em São Paulo — outro dia civil.
    vi.setSystemTime(new Date("2026-01-02T03:00:00Z"));
    const id2 = await quota.reserve("senior-user", policy);
    expect(id2).not.toBeNull();
  });

  it("PHD (3/day, America/Sao_Paulo): 3 no mesmo dia civil passam, o 4º não", async () => {
    const policy = { limit: 3, window: "day" } as const;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T14:00:00Z")); // meio do dia em São Paulo
    for (let i = 0; i < 3; i++) {
      const id = await quota.reserve("phd-user", policy);
      expect(id).not.toBeNull();
      await quota.confirm(id!);
    }
    expect(await quota.reserve("phd-user", policy)).toBeNull();
  });

  it("RESERVED com mais de 10 minutos não conta (proteção contra processo morto)", async () => {
    const policy = { limit: 1, window: "rolling7d" } as const;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const id1 = await quota.reserve("stale-user", policy);
    expect(id1).not.toBeNull();
    // NUNCA confirmada nem estornada (processo "morreu" no meio) — 11 min depois:
    vi.setSystemTime(new Date("2026-01-01T12:11:00Z"));
    const id2 = await quota.reserve("stale-user", policy);
    expect(id2).not.toBeNull(); // a RESERVED velha não contou mais
  });
});
