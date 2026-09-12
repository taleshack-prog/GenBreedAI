import { describe, it, expect, beforeEach } from "vitest";
import { ImageQuotaService, monthlyImageLimit, modelForTier } from "../src/economy/image-quota.service";

describe("Cota de imagem por tier", () => {
  let q: ImageQuotaService;
  beforeEach(() => { delete process.env.DATABASE_URL; q = new ImageQuotaService(); });

  it("limites: FREE 0, JUNIOR 10, SENIOR 20, PHD 30", () => {
    expect(monthlyImageLimit("FREE")).toBe(0);
    expect(monthlyImageLimit("JUNIOR")).toBe(10);
    expect(monthlyImageLimit("SENIOR")).toBe(20);
    expect(monthlyImageLimit("PHD")).toBe(30);
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
