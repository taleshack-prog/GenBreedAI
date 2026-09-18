import { describe, it, expect, beforeEach, vi } from "vitest";
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

  it("crédito (1 crédito = 1 nascimento extra) é consumível", async () => {
    const link = await ref.getOrCreateLink("alice");
    await ref.recordEvent(link.code, "bob", "install");
    expect(await wallet.consumeImageCredit("alice")).toBe(true);
    expect(await wallet.consumeImageCredit("alice")).toBe(false);
  });

  it("bônus quinzenal (ADR-0021, era semanal): +1 crédito, 1x a cada 15 dias corridos", async () => {
    const a = await wallet.claimBiweekly("carol");
    expect(a.claimed).toBe(true);
    expect(a.wallet.imageCredits).toBe(1);
    const b = await wallet.claimBiweekly("carol");
    expect(b.claimed).toBe(false);
  });

  it("bônus quinzenal: 14 dias depois ainda bloqueado; 15 dias + 1 min depois libera de novo (janela MÓVEL, não bucket de calendário)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      const first = await wallet.claimBiweekly("dave");
      expect(first.claimed).toBe(true);

      vi.setSystemTime(new Date("2026-01-15T11:59:00Z")); // 13d23h59min depois
      expect((await wallet.claimBiweekly("dave")).claimed).toBe(false);

      vi.setSystemTime(new Date("2026-01-16T12:01:00Z")); // 15 dias + 1 min depois
      const second = await wallet.claimBiweekly("dave");
      expect(second.claimed).toBe(true);
      expect(second.wallet.imageCredits).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
