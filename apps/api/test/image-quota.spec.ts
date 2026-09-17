import { describe, it, expect, beforeEach } from "vitest";
import type { Tier } from "@genbreedai/shared";
import { ImageQuotaService, monthlyImageLimit, modelForTier } from "../src/economy/image-quota.service";
import { tierPolicy } from "../src/common/tiers";

describe("Cota de retratos EXTRAS por tier (ADR-0019 — não conta o retrato incluído no cruzamento)", () => {
  let q: ImageQuotaService;
  beforeEach(() => { delete process.env.DATABASE_URL; q = new ImageQuotaService(); });

  it("limites: FREE 0, JUNIOR 0 (só créditos), SENIOR 15, PHD 20", () => {
    expect(monthlyImageLimit("FREE")).toBe(0);
    expect(monthlyImageLimit("JUNIOR")).toBe(0);
    expect(monthlyImageLimit("SENIOR")).toBe(15);
    expect(monthlyImageLimit("PHD")).toBe(20);
  });

  it("fonte única: monthlyImageLimit(tier) === tierPolicy(tier).monthlyExtraImages, pra todo tier", () => {
    for (const tier of ["FREE", "JUNIOR", "SENIOR", "PHD"] as Tier[]) {
      expect(monthlyImageLimit(tier)).toBe(tierPolicy(tier).monthlyExtraImages);
    }
  });

  it("bate com o que é vendido em apps/web/lib/plans.ts (ADR-0019)", () => {
    // apps/api não pode importar de apps/web (fora do rootDir/include do
    // tsconfig do pacote — ver apps/api/tsconfig.json) — comparação por
    // literal, não por import. Se plans.ts mudar, atualizar aqui também.
    const soldToCustomer: Record<Tier, number> = { FREE: 0, JUNIOR: 0, SENIOR: 15, PHD: 20 };
    for (const tier of ["FREE", "JUNIOR", "SENIOR", "PHD"] as Tier[]) {
      expect(monthlyImageLimit(tier)).toBe(soldToCustomer[tier]);
    }
  });
  it("modelForTier: mesmo modelo (fal-ai/flux-2-pro) pra todo tier, sem FAL_MODEL definida", () => {
    delete process.env.FAL_MODEL;
    delete process.env.FAL_MODEL_PHD;
    for (const tier of ["FREE", "JUNIOR", "SENIOR", "PHD"] as Tier[]) {
      expect(modelForTier(tier)).toBe("fal-ai/flux-2-pro");
    }
  });
  it("modelForTier: com FAL_MODEL definida, devolve o valor da env — mesmo modelo pra todo tier", () => {
    process.env.FAL_MODEL = "fal-ai/algum-outro-modelo";
    for (const tier of ["FREE", "JUNIOR", "SENIOR", "PHD"] as Tier[]) {
      expect(modelForTier(tier)).toBe("fal-ai/algum-outro-modelo");
    }
    delete process.env.FAL_MODEL;
  });
  it("FAL_MODEL_PHD definida é IGNORADA (compatibilidade) — não muda mais o modelo do PHD", () => {
    delete process.env.FAL_MODEL;
    process.env.FAL_MODEL_PHD = "fal-ai/flux-pro/v1.1";
    expect(modelForTier("PHD")).toBe("fal-ai/flux-2-pro");
    delete process.env.FAL_MODEL_PHD;
  });
  it("FREE não pode consumir (cota 0)", async () => {
    expect(await q.tryConsume("u", "FREE")).toBe(false);
  });
  it("JUNIOR não pode consumir (cota 0 — só créditos, ADR-0019)", async () => {
    expect(await q.tryConsume("u-junior", "JUNIOR")).toBe(false);
  });
  it("SENIOR consome 15 e depois bloqueia", async () => {
    for (let i = 0; i < 15; i++) expect(await q.tryConsume("u2", "SENIOR")).toBe(true);
    expect(await q.tryConsume("u2", "SENIOR")).toBe(false);
    expect(await q.remaining("u2", "SENIOR")).toBe(0);
  });
});
