/**
 * Reserva atômica de cota (QuotaGuard.tryConsume) + estorno em falha
 * (CrossController.create → QuotaService.release). QuotaService é REAL;
 * CrossService é FALSO (mock) — sem motor, sem repositório, sem DB. Testa
 * só o contrato de reserva/estorno, TDD §6/§8.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BadRequestException, NotFoundException, HttpException, ExecutionContext } from "@nestjs/common";
import type { Tier } from "@genbreedai/shared";
import { CrossController } from "../src/cross/cross.controller";
import { CrossService } from "../src/cross/cross.service";
import { QuotaGuard } from "../src/quota/quota.guard";
import { QuotaService } from "../src/quota/quota.service";
import { TierService } from "../src/billing/tier.service";
import type { CrossDto } from "../src/cross/dto/cross.dto";

/** Contexto Nest mínimo: só o que AuthGuard/QuotaGuard/CrossController leem. */
function makeContext(userId: string): ExecutionContext {
  const req = { user: { id: userId, tier: "FREE" as Tier } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const DTO: CrossDto = { sireId: "s", damId: "d", method: "F1" } as CrossDto;

describe("Reserva de cota (QuotaGuard) + estorno (CrossController)", () => {
  let quota: QuotaService;
  let tier: TierService;
  let originalUnlimited: string | undefined;

  beforeEach(() => {
    originalUnlimited = process.env.CROSS_QUOTA_UNLIMITED;
    delete process.env.CROSS_QUOTA_UNLIMITED;
    quota = new QuotaService();
    quota.resetAll();
    // FREE: dailyCrosses = 1 (TIER_POLICIES) — limite mínimo, ideal pra testar reserva/corrida.
    tier = { resolve: async () => "FREE" as Tier } as unknown as TierService;
  });

  afterEach(() => {
    quota.resetAll();
    if (originalUnlimited === undefined) delete process.env.CROSS_QUOTA_UNLIMITED;
    else process.env.CROSS_QUOTA_UNLIMITED = originalUnlimited;
  });

  function makeController(execute: CrossService["execute"]) {
    const service = { execute } as unknown as CrossService;
    const guard = new QuotaGuard(quota, tier);
    const controller = new CrossController(service, tier, quota);
    return { service, guard, controller };
  }

  it("sucesso → cota cai 1", async () => {
    const { guard, controller } = makeController(vi.fn().mockResolvedValue({ specimen: {}, cacheKey: "k", engine: {} }));
    const ctx = makeContext("u1");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await controller.create({ id: "u1", tier: "FREE" }, DTO);
    expect(quota.remaining("u1", 1)).toBe(0); // 1 reservado, nenhum estorno
  });

  it("service lança BadRequestException → cota intacta (estornada)", async () => {
    const { guard, controller } = makeController(vi.fn().mockRejectedValue(new BadRequestException("ruim")));
    const ctx = makeContext("u2");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(controller.create({ id: "u2", tier: "FREE" }, DTO)).rejects.toThrow(BadRequestException);
    expect(quota.remaining("u2", 1)).toBe(1); // estornado — reserva não deixou rastro
  });

  it("service lança NotFoundException → cota intacta (estornada)", async () => {
    const { guard, controller } = makeController(vi.fn().mockRejectedValue(new NotFoundException("não achou")));
    const ctx = makeContext("u3");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(controller.create({ id: "u3", tier: "FREE" }, DTO)).rejects.toThrow(NotFoundException);
    expect(quota.remaining("u3", 1)).toBe(1);
  });

  it("service lança erro genérico → cota intacta (estornada)", async () => {
    const { guard, controller } = makeController(vi.fn().mockRejectedValue(new Error("boom")));
    const ctx = makeContext("u4");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(controller.create({ id: "u4", tier: "FREE" }, DTO)).rejects.toThrow("boom");
    expect(quota.remaining("u4", 1)).toBe(1);
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
      const ctx = makeContext(userId);
      await guard.canActivate(ctx); // lança HttpException 429 se a cota já foi consumida
      return controller.create({ id: userId, tier: "FREE" }, DTO);
    }

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0]!.reason).toBeInstanceOf(HttpException);
    expect((rejected[0]!.reason as HttpException).getStatus()).toBe(429);
    expect(quota.remaining(userId, 1)).toBe(0); // exatamente 1 reservado, sem estorno (sucesso)
  });

  it("CROSS_QUOTA_UNLIMITED=true → release não quebra", () => {
    process.env.CROSS_QUOTA_UNLIMITED = "true";
    expect(() => quota.release("qualquer-um")).not.toThrow();
  });
});
