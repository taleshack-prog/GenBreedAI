/**
 * Bônus quinzenal (ADR-0021 — item 8; era semanal, ADR-0019): só a partir do
 * Junior. FREE → 403. Arquivo mantido com o nome antigo (`claim-weekly.spec.ts`)
 * — não há comando de rename disponível nesta rodada (só edição de arquivos);
 * reportado no resumo.
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

describe("claimBiweekly — bônus quinzenal só a partir do Junior (ADR-0021)", () => {
  it("FREE → 403 'Bônus quinzenal disponível a partir do plano Junior.'", async () => {
    const controller = makeController("FREE");
    let caught: unknown;
    try { await controller.claimBiweekly({ id: "u-free", tier: "FREE" }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as Error).message).toBe("Bônus quinzenal disponível a partir do plano Junior.");
  });

  it("JUNIOR → ok (concede o crédito)", async () => {
    const controller = makeController("JUNIOR");
    const r = await controller.claimBiweekly({ id: "u-junior", tier: "JUNIOR" });
    expect(r.claimed).toBe(true);
  });

  it("SENIOR e PHD → ok também", async () => {
    for (const tier of ["SENIOR", "PHD"] as Tier[]) {
      const controller = makeController(tier);
      const r = await controller.claimBiweekly({ id: `u-${tier}`, tier });
      expect(r.claimed).toBe(true);
    }
  });

  it("2ª chamada antes de 15 dias corridos → claimed: false (não concede de novo)", async () => {
    const controller = makeController("JUNIOR");
    const first = await controller.claimBiweekly({ id: "u-junior2", tier: "JUNIOR" });
    expect(first.claimed).toBe(true);
    const second = await controller.claimBiweekly({ id: "u-junior2", tier: "JUNIOR" });
    expect(second.claimed).toBe(false);
  });
});
