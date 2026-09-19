/**
 * Indicação (ADR-0024) — SERVER-SIDE: "cadastrou" (linkReferred) só GRAVA o
 * vínculo e NÃO credita (sem verificação de e-mail, cadastro é farmável);
 * "converteu" (recordConversion, assinatura) e a compra de pacotes de créditos
 * (recordPackPurchase — ver referral-packs.spec.ts) são os ÚNICOS que pagam: só
 * recompensa quando o indicado GASTA. D1/D7 foram CANCELADOS (ADR-0024, rev. 2).
 * Rota pública de marco não existe (removida em 14/09).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReferralService, CONVERT_CREDITS, REFERRAL_GRANT_DAYS } from "../src/referral/referral.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import type { SystemClock } from "../src/common/clock";
import { InMemorySubscriptionsRepository } from "../src/billing/subscriptions.repository";
import type { TierService } from "../src/billing/tier.service";
import type { InMemoryGrantedTiersRepository } from "../src/billing/granted-tiers.repository";
import { mailboxKey } from "../src/referral/self-referral";
import { makeReferralStack } from "./helpers/referral";

describe("Referral — 'cadastrou' (linkReferred): grava o vínculo, NÃO credita", () => {
  let ref: ReferralService; let wallet: WalletService;
  beforeEach(() => {
    wallet = new WalletService(new InMemoryWalletRepository());
    ({ referral: ref } = makeReferralStack(wallet));
  });
  const credits = async (id: string) => (await wallet.get(id)).imageCredits ?? 0;

  it("vincula uma vez por indicado, conta o cadastro e NÃO paga crédito nenhum", async () => {
    const link = await ref.getOrCreateLink("alice");
    expect(await ref.linkReferred(link.code, "bob")).toEqual({ linked: true });
    expect(await ref.linkReferred(link.code, "bob")).toEqual({ linked: false }); // idempotente
    expect(await credits("alice")).toBe(0);
    const after = await ref.getOrCreateLink("alice");
    expect(after.installs).toBe(1); // contador informativo
    expect(after.creditsEarned).toBe(0);
  });

  it("atribuição ÚNICA: o mesmo indicado com OUTRO código não vincula de novo", async () => {
    const a = await ref.getOrCreateLink("alice");
    const c = await ref.getOrCreateLink("carol");
    await ref.linkReferred(a.code, "bob");
    expect(await ref.linkReferred(c.code, "bob")).toEqual({ linked: false });
    expect((await ref.getOrCreateLink("carol")).installs).toBe(0);
  });

  it("auto-indicação (mesmo usuário) não vincula", async () => {
    const link = await ref.getOrCreateLink("alice");
    expect(await ref.linkReferred(link.code, "alice")).toEqual({ linked: false });
    expect(await ref.recordConversion("alice", { id: "sub_x", tier: "SENIOR" })).toEqual({ credited: 0, grantedTier: null });
  });

  it("código inválido/inexistente/de tipo errado → não vincula, sem lançar", async () => {
    expect(await ref.linkReferred("nao-existe", "bob")).toEqual({ linked: false });
    expect(await ref.linkReferred("!!", "bob")).toEqual({ linked: false });
    expect(await ref.linkReferred(undefined as unknown as string, "bob")).toEqual({ linked: false });
  });

  it("aceita o código em qualquer caixa/com espaços (vem da URL)", async () => {
    const link = await ref.getOrCreateLink("alice");
    expect(await ref.linkReferred(`  ${link.code.toUpperCase()} `, "bob")).toEqual({ linked: true });
  });

  it("o vínculo gravado é o que permite pagar na conversão (sem vínculo, nada é pago)", async () => {
    const link = await ref.getOrCreateLink("alice");
    await ref.linkReferred(link.code, "bob");
    expect((await ref.recordConversion("bob", { id: "sub_1", tier: "JUNIOR" })).credited).toBe(15);
    expect(await credits("alice")).toBe(15);
    expect((await ref.recordConversion("zeca", { id: "sub_2", tier: "JUNIOR" })).credited).toBe(0); // zeca nunca foi vinculado
  });

  it("crédito (1 crédito = 1 nascimento extra) vindo da conversão é consumível", async () => {
    const link = await ref.getOrCreateLink("alice");
    await ref.linkReferred(link.code, "bob");
    await ref.recordConversion("bob", { id: "sub_1", tier: "JUNIOR" });
    expect(await wallet.consumeImageCredit("alice")).toBe(true);
  });

  it("não existe mais recordEvent/recordInstall (só linkReferred e recordConversion)", () => {
    const r = ref as unknown as Record<string, unknown>;
    expect(r.recordEvent).toBeUndefined();
    expect(r.recordInstall).toBeUndefined();
  });
});

describe("Referral — marco 'converteu' (recordConversion)", () => {
  let ref: ReferralService; let wallet: WalletService; let tiers: TierService;
  let grants: InMemoryGrantedTiersRepository; let subs: InMemorySubscriptionsRepository; let clock: SystemClock;
  beforeEach(() => {
    wallet = new WalletService(new InMemoryWalletRepository());
    ({ referral: ref, tiers, grants, subs, clock } = makeReferralStack(wallet));
  });
  afterEach(() => clock.setForTesting(null));

  /** alice indica bob (vínculo gravado no cadastro — sem crédito); devolve o código. */
  async function invite(owner = "alice", referred = "bob") {
    const link = await ref.getOrCreateLink(owner);
    await ref.linkReferred(link.code, referred);
    return link.code;
  }
  const credits = async (id: string) => (await wallet.get(id)).imageCredits ?? 0;

  it("JUNIOR → +15 créditos ao indicador; SENIOR → +30", async () => {
    await invite("alice", "bob");
    await invite("carol", "dave");
    const r1 = await ref.recordConversion("bob", { id: "sub_1", tier: "JUNIOR" });
    const r2 = await ref.recordConversion("dave", { id: "sub_2", tier: "SENIOR" });
    expect(r1).toEqual({ credited: CONVERT_CREDITS.JUNIOR, grantedTier: null });
    expect(r2).toEqual({ credited: CONVERT_CREDITS.SENIOR, grantedTier: null });
    expect(await credits("alice")).toBe(15);
    expect(await credits("carol")).toBe(30);
    expect((await ref.getOrCreateLink("alice")).conversions).toBe(1);
    expect((await ref.getOrCreateLink("alice")).creditsEarned).toBe(15);
  });

  it("idempotente por indicado: mesma assinatura repetida OU uma 2ª assinatura do mesmo usuário não creditam de novo", async () => {
    await invite();
    await ref.recordConversion("bob", { id: "sub_1", tier: "JUNIOR" });
    expect((await ref.recordConversion("bob", { id: "sub_1", tier: "JUNIOR" })).credited).toBe(0); // reenvio do webhook
    expect((await ref.recordConversion("bob", { id: "sub_2", tier: "SENIOR" })).credited).toBe(0); // reassinou
    expect(await credits("alice")).toBe(15);
  });

  it("indicado que NÃO veio de indicação não credita ninguém", async () => {
    expect(await ref.recordConversion("zeca", { id: "sub_9", tier: "SENIOR" })).toEqual({ credited: 0, grantedTier: null });
  });

  it("PHD com indicador FREE → 1 mês de JUNIOR via granted_tiers (30 dias, reason com a origem), sem créditos", async () => {
    // Relógio simulado (`Clock`): o ReferralService (que concede) e o TierService (que resolve) leem o MESMO `clock`
    // (ver `helpers/referral.ts`) — sem fake timers globais (ADR-0029). Mais casos de tempo em `tier-clock.spec.ts`.
    const start = new Date("2026-09-18T12:00:00Z");
    clock.setForTesting(start);
    await invite();
    const r = await ref.recordConversion("bob", { id: "sub_phd", tier: "PHD" });
    expect(r).toEqual({ credited: 0, grantedTier: "JUNIOR" });
    const grant = await grants.findActiveForUser("alice", clock.now());
    expect(grant?.tier).toBe("JUNIOR");
    expect(grant?.expiresAt.getTime()).toBe(start.getTime() + REFERRAL_GRANT_DAYS * 24 * 60 * 60 * 1000);
    expect(grant?.reason).toBe("REFERRAL_PHD:bob:sub_phd");
    expect(await tiers.resolve("alice")).toBe("JUNIOR"); // o indicador FREE passa a JUNIOR
    expect(await credits("alice")).toBe(0); // PHD dá tier, não créditos
    // e expira: 31 dias depois volta a FREE
    clock.setForTesting(new Date(start.getTime() + 31 * 24 * 60 * 60 * 1000));
    expect(await tiers.resolve("alice")).toBe("FREE");
  });

  it("PHD com indicador que já é SENIOR → concede o plano DELE (SENIOR), não JUNIOR", async () => {
    await subs.create({ id: "sub_alice", userId: "alice", tier: "SENIOR", interval: "MONTH", stripeCustomerId: "cus_a", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 86_400_000), cancelAtPeriodEnd: false });
    await invite();
    const r = await ref.recordConversion("bob", { id: "sub_phd", tier: "PHD" });
    expect(r.grantedTier).toBe("SENIOR");
    expect((await grants.findActiveForUser("alice", clock.now()))?.tier).toBe("SENIOR");
  });

  it("PHD repetido não concede duas vezes", async () => {
    await invite();
    await ref.recordConversion("bob", { id: "sub_phd", tier: "PHD" });
    expect((await ref.recordConversion("bob", { id: "sub_phd", tier: "PHD" })).grantedTier).toBeNull();
  });

  it("falha ao recompensar desfaz a reivindicação (o próximo webhook tenta de novo)", async () => {
    await invite();
    const spy = vi.spyOn(wallet, "creditImageCredits").mockRejectedValueOnce(new Error("db caiu"));
    await expect(ref.recordConversion("bob", { id: "sub_1", tier: "JUNIOR" })).rejects.toThrow(/db caiu/);
    spy.mockRestore();
    expect((await ref.recordConversion("bob", { id: "sub_1", tier: "JUNIOR" })).credited).toBe(15);
  });
});

describe("mailboxKey (auto-indicação por alias)", () => {
  it("normaliza +tag, caixa e pontos do Gmail", () => {
    expect(mailboxKey("Alice@Exemplo.com")).toBe("alice@exemplo.com");
    expect(mailboxKey("alice+promo@exemplo.com")).toBe("alice@exemplo.com");
    expect(mailboxKey("a.l.i.c.e+x@gmail.com")).toBe("alice@gmail.com");
    expect(mailboxKey("alice@googlemail.com")).toBe("alice@gmail.com");
    expect(mailboxKey("a.lice@exemplo.com")).toBe("a.lice@exemplo.com"); // ponto só é ignorado no Gmail
  });
});

describe("Bônus quinzenal (ADR-0021) — inalterado", () => {
  let wallet: WalletService;
  beforeEach(() => { delete process.env.DATABASE_URL; wallet = new WalletService(new InMemoryWalletRepository()); });

  it("+1 crédito, 1x a cada 15 dias corridos", async () => {
    const a = await wallet.claimBiweekly("carol");
    expect(a.claimed).toBe(true);
    expect(a.wallet.imageCredits).toBe(1);
    const b = await wallet.claimBiweekly("carol");
    expect(b.claimed).toBe(false);
  });

  it("14 dias depois ainda bloqueado; 15 dias + 1 min depois libera de novo (janela MÓVEL, não bucket de calendário)", async () => {
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
