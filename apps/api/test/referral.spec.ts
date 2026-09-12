import { describe, it, expect, beforeEach } from "vitest";
import { ReferralService } from "../src/referral/referral.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";

describe("Referral (viralização anti-fraude)", () => {
  let ref: ReferralService; let wallet: WalletService; let repo: InMemoryWalletRepository;
  beforeEach(() => { delete process.env.DATABASE_URL; repo = new InMemoryWalletRepository(); wallet = new WalletService(repo); ref = new ReferralService(wallet); });

  it("crédito escalonado: install 1, d1 1, d7 2, convert 15", async () => {
    const link = await ref.getOrCreateLink("alice");
    await ref.recordEvent(link.code, "bob", "install");
    await ref.recordEvent(link.code, "bob", "d1");
    await ref.recordEvent(link.code, "bob", "d7");
    await ref.recordEvent(link.code, "bob", "convert");
    const w = await wallet.get("alice");
    expect(w.imageCredits).toBe(1 + 1 + 2 + 15); // 19
  });

  it("não credita o mesmo marco 2x (anti-fraude)", async () => {
    const link = await ref.getOrCreateLink("alice");
    await ref.recordEvent(link.code, "bob", "install");
    const dup = await ref.recordEvent(link.code, "bob", "install");
    expect(dup.credited).toBe(0);
    expect((await wallet.get("alice")).imageCredits).toBe(1);
  });

  it("não credita auto-indicação", async () => {
    const link = await ref.getOrCreateLink("alice");
    const r = await ref.recordEvent(link.code, "alice", "convert");
    expect(r.credited).toBe(0);
  });

  it("crédito de imagem é consumível", async () => {
    const link = await ref.getOrCreateLink("alice");
    await ref.recordEvent(link.code, "bob", "install");
    expect(await wallet.consumeImageCredit("alice")).toBe(true);
    expect(await wallet.consumeImageCredit("alice")).toBe(false);
  });

  it("bônus semanal: +1 crédito, 1x por semana", async () => {
    const a = await wallet.claimWeekly("carol");
    expect(a.claimed).toBe(true);
    expect(a.wallet.imageCredits).toBe(1);
    const b = await wallet.claimWeekly("carol");
    expect(b.claimed).toBe(false);
  });
});
