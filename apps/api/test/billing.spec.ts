import { describe, it, expect, beforeEach } from "vitest";
import { BillingService } from "../src/billing/billing.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";

describe("Compra de créditos (billing)", () => {
  let billing: BillingService; let wallet: WalletService;
  beforeEach(() => { delete process.env.DATABASE_URL; wallet = new WalletService(new InMemoryWalletRepository()); billing = new BillingService(wallet); });

  it("pacotes: 10/50/100 com preços corretos", () => {
    const p = billing.packs();
    expect(p.map((x) => x.credits)).toEqual([10, 50, 100]);
    expect(p.find((x) => x.id === "pack-50")!.priceBRL).toBe(20);
  });

  it("checkout → confirm credita os créditos", async () => {
    const intent = await billing.createCheckout("u", "pack-50");
    expect(intent.status).toBe("PENDING");
    const r = await billing.confirm("u", intent.id);
    expect(r.status).toBe("PAID");
    expect(r.creditsAdded).toBe(50);
    expect((await wallet.get("u")).imageCredits).toBe(50);
  });

  it("idempotente: confirmar 2x não credita em dobro", async () => {
    const intent = await billing.createCheckout("u", "pack-10");
    await billing.confirm("u", intent.id);
    const again = await billing.confirm("u", intent.id);
    expect(again.creditsAdded).toBe(0);
    expect((await wallet.get("u")).imageCredits).toBe(10);
  });

  it("pacote inválido é rejeitado", async () => {
    await expect(billing.createCheckout("u", "pack-x")).rejects.toThrow(/inválido/);
  });
});
