import { describe, it, expect, beforeEach } from "vitest";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";

describe("Economia (fontes + custo)", () => {
  let w: WalletService;
  beforeEach(() => { w = new WalletService(new InMemoryWalletRepository()); });

  it("recompensa por fixação: aura 5 credita; aura 3 não", async () => {
    const r5 = await w.rewardForCross("u", 5);
    expect(r5!.catalisadores).toBe(12450 + 300);
    const r3 = await w.rewardForCross("u2", 3);
    expect(r3).toBeNull();
  });

  it("diário: credita 1x por dia (2ª vez no mesmo dia não credita)", async () => {
    const a = await w.claimDaily("demo", "PHD");
    expect(a.claimed).toBe(true);
    expect(a.wallet.catalisadores).toBe(12450 + 600);
    const b = await w.claimDaily("demo", "PHD");
    expect(b.claimed).toBe(false);
    expect(b.wallet.catalisadores).toBe(a.wallet.catalisadores);
  });

  it("congelar custa pouco (20 catalisadores)", async () => {
    const { FREEZE_COST } = await import("../src/economy/wallet.service");
    expect(FREEZE_COST.catalisadores).toBe(20);
  });
});
