/**
 * Bônus semanal (ADR-0019): só a partir do Junior. FREE → 403.
 */
import { describe, it, expect } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { Tier } from "@genbreedai/shared";
import { GeneBankController } from "../src/gene-bank/gene-bank.controller";
import { GeneBankService } from "../src/gene-bank/gene-bank.service";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { CrossService } from "../src/cross/cross.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { TierService } from "../src/billing/tier.service";

function makeController(tier: Tier) {
  const repo = new InMemorySpecimenRepository();
  const wallet = new WalletService(new InMemoryWalletRepository());
  const cross = new CrossService(repo, wallet);
  const gb = new GeneBankService(repo, cross, wallet);
  const tierService = { resolve: async () => tier } as unknown as TierService;
  return new GeneBankController(gb, wallet, tierService);
}

describe("claimWeekly — bônus semanal só a partir do Junior (ADR-0019)", () => {
  it("FREE → 403 'Bônus semanal disponível a partir do plano Junior.'", async () => {
    const controller = makeController("FREE");
    let caught: unknown;
    try { await controller.claimWeekly({ id: "u-free", tier: "FREE" }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as Error).message).toBe("Bônus semanal disponível a partir do plano Junior.");
  });

  it("JUNIOR → ok (concede o crédito)", async () => {
    const controller = makeController("JUNIOR");
    const r = await controller.claimWeekly({ id: "u-junior", tier: "JUNIOR" });
    expect(r.claimed).toBe(true);
  });

  it("SENIOR e PHD → ok também", async () => {
    for (const tier of ["SENIOR", "PHD"] as Tier[]) {
      const controller = makeController(tier);
      const r = await controller.claimWeekly({ id: `u-${tier}`, tier });
      expect(r.claimed).toBe(true);
    }
  });
});
