import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TierService } from "../src/billing/tier.service";
import { InMemorySubscriptionsRepository, type SubscriptionRow } from "../src/billing/subscriptions.repository";
import { InMemoryGrantedTiersRepository, type GrantedTierRow } from "../src/billing/granted-tiers.repository";

function sub(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "sub_1", userId: "alice", tier: "SENIOR", interval: "MONTH",
    stripeCustomerId: "cus_1", status: "ACTIVE",
    currentPeriodEnd: new Date(Date.now() + 86_400_000), cancelAtPeriodEnd: false,
    ...overrides,
  };
}
function grant(overrides: Partial<GrantedTierRow> = {}): GrantedTierRow {
  return { id: "g_1", userId: "alice", tier: "PHD", expiresAt: new Date(Date.now() + 86_400_000), reason: "REFERRAL_PHD", ...overrides };
}

describe("TierService — resolução de tier por consulta (nunca por JWT)", () => {
  let subs: InMemorySubscriptionsRepository; let grants: InMemoryGrantedTiersRepository; let tier: TierService;
  beforeEach(() => {
    subs = new InMemorySubscriptionsRepository();
    grants = new InMemoryGrantedTiersRepository();
    tier = new TierService(subs, grants);
    delete process.env.AUTH_DEV_HEADERS;
  });
  afterEach(() => { delete process.env.AUTH_DEV_HEADERS; });

  it("sem assinatura, sem concessão, sem devHint → FREE", async () => {
    expect(await tier.resolve("alice")).toBe("FREE");
  });

  it("assinatura ACTIVE → tier dela", async () => {
    await subs.create(sub({ tier: "SENIOR", status: "ACTIVE" }));
    expect(await tier.resolve("alice")).toBe("SENIOR");
  });

  it("assinatura PAST_DUE ainda dentro do período → tier dela", async () => {
    await subs.create(sub({ tier: "JUNIOR", status: "PAST_DUE", currentPeriodEnd: new Date(Date.now() + 3600_000) }));
    expect(await tier.resolve("alice")).toBe("JUNIOR");
  });

  it("assinatura PAST_DUE com período JÁ vencido → não conta (cai pro próximo nível)", async () => {
    await subs.create(sub({ tier: "JUNIOR", status: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - 3600_000) }));
    expect(await tier.resolve("alice")).toBe("FREE");
  });

  it("assinatura CANCELED → não conta", async () => {
    await subs.create(sub({ tier: "PHD", status: "CANCELED" }));
    expect(await tier.resolve("alice")).toBe("FREE");
  });

  it("sem assinatura, granted_tier não expirado → tier concedido", async () => {
    await grants.grant(grant({ tier: "PHD" }));
    expect(await tier.resolve("alice")).toBe("PHD");
  });

  it("granted_tier expirado → não conta", async () => {
    await grants.grant(grant({ tier: "PHD", expiresAt: new Date(Date.now() - 1000) }));
    expect(await tier.resolve("alice")).toBe("FREE");
  });

  it("assinatura ACTIVE sempre vence granted_tier, mesmo se o tier concedido for maior", async () => {
    await subs.create(sub({ tier: "JUNIOR", status: "ACTIVE" }));
    await grants.grant(grant({ tier: "PHD" }));
    expect(await tier.resolve("alice")).toBe("JUNIOR");
  });

  it("devHint só é usado com AUTH_DEV_HEADERS=true", async () => {
    expect(await tier.resolve("alice", "PHD")).toBe("FREE"); // sem a flag, ignora o hint
    process.env.AUTH_DEV_HEADERS = "true";
    expect(await tier.resolve("alice", "PHD")).toBe("PHD");
  });

  it("devHint nunca derruba assinatura/concessão real, mesmo com AUTH_DEV_HEADERS=true", async () => {
    process.env.AUTH_DEV_HEADERS = "true";
    await subs.create(sub({ tier: "SENIOR", status: "ACTIVE" }));
    expect(await tier.resolve("alice", "FREE")).toBe("SENIOR");
  });

  it("tiers de usuários diferentes não se misturam", async () => {
    await subs.create(sub({ id: "sub_a", userId: "alice", tier: "PHD", status: "ACTIVE" }));
    expect(await tier.resolve("bob")).toBe("FREE");
  });
});
