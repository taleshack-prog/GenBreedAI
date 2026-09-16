import { describe, it, expect, beforeEach } from "vitest";
import type { Tier } from "@genbreedai/shared";
import { ImageQuotaService, monthlyImageLimit, modelForTier } from "../src/economy/image-quota.service";
import { tierPolicy } from "../src/common/tiers";

describe("Cota de imagem por tier", () => {
  let q: ImageQuotaService;
  beforeEach(() => { delete process.env.DATABASE_URL; q = new ImageQuotaService(); });

  it("limites: FREE 0, JUNIOR 10, SENIOR 20, PHD 30", () => {
    expect(monthlyImageLimit("FREE")).toBe(0);
    expect(monthlyImageLimit("JUNIOR")).toBe(10);
    expect(monthlyImageLimit("SENIOR")).toBe(20);
    expect(monthlyImageLimit("PHD")).toBe(30);
  });

  it("fonte única: monthlyImageLimit(tier) === tierPolicy(tier).monthlyPremiumImages, pra todo tier", () => {
    for (const tier of ["FREE", "JUNIOR", "SENIOR", "PHD"] as Tier[]) {
      expect(monthlyImageLimit(tier)).toBe(tierPolicy(tier).monthlyPremiumImages);
    }
  });

  it("bate com o que é vendido em apps/web/lib/plans.ts (PLANS[].images: '0 (...)', '10 / mês', '20 / mês', '30 / mês')", () => {
    // apps/api não pode importar de apps/web (fora do rootDir/include do
    // tsconfig do pacote — ver apps/api/tsconfig.json) — comparação por
    // literal, não por import. Se plans.ts mudar, atualizar aqui também.
    const soldToCustomer: Record<Tier, number> = { FREE: 0, JUNIOR: 10, SENIOR: 20, PHD: 30 };
    for (const tier of ["FREE", "JUNIOR", "SENIOR", "PHD"] as Tier[]) {
      expect(monthlyImageLimit(tier)).toBe(soldToCustomer[tier]);
    }
  });
  it("PhD usa FLUX Pro quando FAL_MODEL_PHD definido; demais usam dev", () => {
    process.env.FAL_MODEL_PHD = "fal-ai/flux-pro/v1.1";
    expect(modelForTier("PHD")).toContain("pro");
    expect(modelForTier("SENIOR")).toContain("dev");
    delete process.env.FAL_MODEL_PHD;
    expect(modelForTier("PHD")).toContain("dev"); // fallback sem a env
  });
  it("FREE não pode consumir (cota 0)", async () => {
    expect(await q.tryConsume("u", "FREE")).toBe(false);
  });
  it("JUNIOR consome 10 e depois bloqueia", async () => {
    for (let i = 0; i < 10; i++) expect(await q.tryConsume("u2", "JUNIOR")).toBe(true);
    expect(await q.tryConsume("u2", "JUNIOR")).toBe(false);
    expect(await q.remaining("u2", "JUNIOR")).toBe(0);
  });
});
