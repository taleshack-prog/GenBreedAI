/**
 * Tier efetivo com RELÓGIO SIMULADO (ADR-0029): a regra NÃO mudou — só ficou testável.
 *  - `granted_tiers`: a concessão vale enquanto `expiresAt > agora` (ESTRITO — no instante exato do vencimento já não
 *    vale). É onde mora o mês grátis do prêmio de indicação PHD (30 dias).
 *  - `subscriptions`: ACTIVE sempre vale; PAST_DUE vale enquanto `currentPeriodEnd > agora` (ESTRITO); CANCELED e
 *    INCOMPLETE nunca valem.
 *  - Prioridade do `TierService`: assinatura válida vence concessão (mesmo que a concessão seja de tier maior); concessão
 *    vencida não promove.
 * O "agora" vem de `Clock` (`SystemClock.setForTesting`, nunca fake timers), passado pelo `TierService` aos repositórios
 * como PARÂMETRO — os repositórios não conhecem relógio.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Clock, SystemClock } from "../src/common/clock";
import { TierService } from "../src/billing/tier.service";
import { InMemorySubscriptionsRepository, type SubscriptionRow, type SubscriptionStatus } from "../src/billing/subscriptions.repository";
import { InMemoryGrantedTiersRepository, type GrantedTierRow } from "../src/billing/granted-tiers.repository";
import { REFERRAL_GRANT_DAYS } from "../src/referral/referral.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { makeReferralStack } from "./helpers/referral";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-09-18T12:00:00.000Z");
const at = (ms: number) => new Date(ms);

function sub(over: Partial<SubscriptionRow> & { status: SubscriptionStatus }): SubscriptionRow {
  return {
    id: "sub_1", userId: "alice", tier: "SENIOR", interval: "MONTH", stripeCustomerId: "cus_1",
    currentPeriodEnd: at(T0 + 10 * DAY), cancelAtPeriodEnd: false, ...over,
  };
}
function grant(over: Partial<GrantedTierRow> = {}): GrantedTierRow {
  return { id: "g_1", userId: "alice", tier: "JUNIOR", expiresAt: at(T0 + 30 * DAY), reason: "REFERRAL_PHD:bob:sub_phd", ...over };
}

describe("tier efetivo com relógio simulado", () => {
  let clock: SystemClock; let subs: InMemorySubscriptionsRepository; let grants: InMemoryGrantedTiersRepository; let tiers: TierService;
  const setNow = (ms: number) => clock.setForTesting(at(ms));
  beforeEach(() => {
    delete process.env.AUTH_DEV_HEADERS;
    clock = new SystemClock();
    subs = new InMemorySubscriptionsRepository();
    grants = new InMemoryGrantedTiersRepository();
    tiers = new TierService(subs, grants, clock);
    setNow(T0);
  });
  afterEach(() => { clock.setForTesting(null); delete process.env.AUTH_DEV_HEADERS; });

  describe("granted_tiers — concessão de 30 dias", () => {
    it("vale no dia 29 e até o ÚLTIMO instante do prazo (dia 30); no instante exato do vencimento e no dia 31 já não vale", async () => {
      await grants.grant(grant({ tier: "JUNIOR", expiresAt: at(T0 + 30 * DAY) })); // concedida em T0, vence em T0 + 30 dias
      for (const [label, ms] of [["logo depois de concedida", T0], ["dia 29", T0 + 29 * DAY], ["dia 30, 1 ms antes do fim", T0 + 30 * DAY - 1]] as const) {
        setNow(ms);
        expect(await tiers.resolve("alice"), label).toBe("JUNIOR");
      }
      for (const [label, ms] of [["no instante exato do vencimento (estrito)", T0 + 30 * DAY], ["1 ms depois", T0 + 30 * DAY + 1], ["dia 31", T0 + 31 * DAY], ["dia 60", T0 + 60 * DAY]] as const) {
        setNow(ms);
        expect(await tiers.resolve("alice"), label).toBe("FREE");
      }
    });

    it("pela via REAL do prêmio de indicação (PHD do indicado → 1 mês de JUNIOR ao indicador FREE): 30 dias a partir da concessão", async () => {
      const wallet = new WalletService(new InMemoryWalletRepository());
      const stack = makeReferralStack(wallet);
      stack.clock.setForTesting(at(T0));
      const link = await stack.referral.getOrCreateLink("alice");
      await stack.referral.linkReferred(link.code, "bob");
      const r = await stack.referral.recordConversion("bob", { id: "sub_phd", tier: "PHD" });
      expect(r.grantedTier).toBe("JUNIOR");
      expect(REFERRAL_GRANT_DAYS).toBe(30);

      const setStack = (ms: number) => stack.clock.setForTesting(at(ms)); // o mesmo Clock do ReferralService e do TierService
      setStack(T0 + 29 * DAY); expect(await stack.tiers.resolve("alice")).toBe("JUNIOR");
      setStack(T0 + 30 * DAY - 1); expect(await stack.tiers.resolve("alice")).toBe("JUNIOR");
      setStack(T0 + 30 * DAY); expect(await stack.tiers.resolve("alice")).toBe("FREE");
      setStack(T0 + 31 * DAY); expect(await stack.tiers.resolve("alice")).toBe("FREE");
    });

    it("com várias concessões vale a de maior posto ENTRE AS AINDA VÁLIDAS; quando a maior vence, a menor assume, e depois ninguém", async () => {
      await grants.grant(grant({ id: "g_phd", tier: "PHD", expiresAt: at(T0 + 10 * DAY) }));
      await grants.grant(grant({ id: "g_jr", tier: "JUNIOR", expiresAt: at(T0 + 30 * DAY) }));
      setNow(T0 + 5 * DAY); expect(await tiers.resolve("alice")).toBe("PHD");
      setNow(T0 + 10 * DAY); expect(await tiers.resolve("alice")).toBe("JUNIOR"); // a PHD venceu neste instante
      setNow(T0 + 29 * DAY); expect(await tiers.resolve("alice")).toBe("JUNIOR");
      setNow(T0 + 30 * DAY); expect(await tiers.resolve("alice")).toBe("FREE");
    });

    it("concessão de OUTRO usuário não vale para este", async () => {
      await grants.grant(grant({ userId: "carol", tier: "PHD" }));
      expect(await tiers.resolve("alice")).toBe("FREE");
      expect(await tiers.resolve("carol")).toBe("PHD");
    });
  });

  describe("subscriptions — quem conta como ativa", () => {
    it("ACTIVE SEMPRE vale — em qualquer instante, mesmo com o período gravado já vencido (quem muda o status é o webhook)", async () => {
      await subs.create(sub({ status: "ACTIVE", tier: "SENIOR", currentPeriodEnd: at(T0 + 5 * DAY) }));
      for (const ms of [T0, T0 + 5 * DAY - 1, T0 + 5 * DAY, T0 + 5 * DAY + 1, T0 + 400 * DAY]) {
        setNow(ms);
        expect(await tiers.resolve("alice"), new Date(ms).toISOString()).toBe("SENIOR");
      }
    });

    it("PAST_DUE vale enquanto `currentPeriodEnd > agora`: 1 ms antes vale; no instante do fim e depois já não vale", async () => {
      const end = T0 + 10 * DAY;
      await subs.create(sub({ status: "PAST_DUE", tier: "JUNIOR", currentPeriodEnd: at(end) }));
      for (const [label, ms] of [["agora", T0], ["no meio do período", T0 + 5 * DAY], ["1 ms antes do fim", end - 1]] as const) {
        setNow(ms);
        expect(await tiers.resolve("alice"), label).toBe("JUNIOR");
      }
      for (const [label, ms] of [["no instante do fim (estrito)", end], ["1 ms depois", end + 1], ["1 dia depois", end + DAY]] as const) {
        setNow(ms);
        expect(await tiers.resolve("alice"), label).toBe("FREE");
      }
    });

    it("CANCELED e INCOMPLETE NUNCA valem — nem com o período no futuro", async () => {
      for (const status of ["CANCELED", "INCOMPLETE"] as const) {
        const s = new InMemorySubscriptionsRepository();
        await s.create(sub({ status, tier: "PHD", currentPeriodEnd: at(T0 + 365 * DAY) }));
        const t = new TierService(s, grants, clock);
        for (const ms of [T0, T0 + DAY, T0 + 300 * DAY]) {
          setNow(ms);
          expect(await t.resolve("alice"), `${status} ${new Date(ms).toISOString()}`).toBe("FREE");
        }
      }
    });

    it("a assinatura que muda de status com o tempo: ACTIVE → PAST_DUE (dentro do período vale, vencido não) → CANCELED (nunca)", async () => {
      await subs.create(sub({ status: "ACTIVE", tier: "SENIOR", currentPeriodEnd: at(T0 + 10 * DAY) }));
      expect(await tiers.resolve("alice")).toBe("SENIOR");
      await subs.updateStatus("sub_1", "PAST_DUE"); // invoice.payment_failed
      setNow(T0 + 9 * DAY); expect(await tiers.resolve("alice")).toBe("SENIOR");
      setNow(T0 + 10 * DAY); expect(await tiers.resolve("alice")).toBe("FREE");
      await subs.updateStatus("sub_1", "CANCELED"); // customer.subscription.deleted
      setNow(T0 + 5 * DAY); expect(await tiers.resolve("alice")).toBe("FREE");
    });
  });

  describe("prioridade do TierService", () => {
    it("assinatura ACTIVE vence a concessão — mesmo se a concessão for de tier MAIOR — e continua vencendo com o tempo", async () => {
      await subs.create(sub({ status: "ACTIVE", tier: "JUNIOR" }));
      await grants.grant(grant({ tier: "PHD", expiresAt: at(T0 + 30 * DAY) }));
      for (const ms of [T0, T0 + 15 * DAY, T0 + 29 * DAY, T0 + 31 * DAY]) {
        setNow(ms);
        expect(await tiers.resolve("alice"), new Date(ms).toISOString()).toBe("JUNIOR");
      }
    });

    it("PAST_DUE dentro do período vence a concessão; passado o período, a concessão (se ainda válida) assume — e vencida também, então FREE", async () => {
      const end = T0 + 10 * DAY;
      await subs.create(sub({ status: "PAST_DUE", tier: "JUNIOR", currentPeriodEnd: at(end) }));
      await grants.grant(grant({ tier: "PHD", expiresAt: at(T0 + 30 * DAY) }));
      setNow(end - 1); expect(await tiers.resolve("alice")).toBe("JUNIOR"); // assinatura ainda vale
      setNow(end); expect(await tiers.resolve("alice")).toBe("PHD");          // venceu → cai na concessão
      setNow(T0 + 30 * DAY); expect(await tiers.resolve("alice")).toBe("FREE"); // concessão também venceu
    });

    it("assinatura CANCELED não bloqueia uma concessão válida", async () => {
      await subs.create(sub({ status: "CANCELED", tier: "PHD" }));
      await grants.grant(grant({ tier: "JUNIOR" }));
      expect(await tiers.resolve("alice")).toBe("JUNIOR");
    });

    it("concessão VENCIDA não promove ninguém (nem quem só tem devHint sem a flag)", async () => {
      await grants.grant(grant({ tier: "PHD", expiresAt: at(T0 - 1) }));
      expect(await tiers.resolve("alice", "PHD")).toBe("FREE"); // sem AUTH_DEV_HEADERS o hint é ignorado
    });
  });

  describe("virada de mês e de ano não quebram a conta", () => {
    it("concessão de 30 dias atravessando dezembro → janeiro", async () => {
      const granted = Date.parse("2026-12-10T08:00:00.000Z");
      const expires = granted + 30 * DAY;
      expect(new Date(expires).toISOString()).toBe("2027-01-09T08:00:00.000Z"); // a própria conta
      await grants.grant(grant({ expiresAt: at(expires) }));
      setNow(Date.parse("2026-12-31T23:59:59.999Z")); expect(await tiers.resolve("alice")).toBe("JUNIOR");
      setNow(Date.parse("2027-01-01T00:00:00.000Z")); expect(await tiers.resolve("alice")).toBe("JUNIOR");
      setNow(expires - 1); expect(await tiers.resolve("alice")).toBe("JUNIOR");
      setNow(expires); expect(await tiers.resolve("alice")).toBe("FREE");
    });

    it("concessão de 30 dias com fevereiro no meio: ano bissexto (2028) e não bissexto (2027)", async () => {
      for (const [grantedIso, expiresIso] of [
        ["2028-02-10T00:00:00.000Z", "2028-03-11T00:00:00.000Z"], // fevereiro de 2028 tem 29 dias
        ["2027-02-10T00:00:00.000Z", "2027-03-12T00:00:00.000Z"], // fevereiro de 2027 tem 28
        ["2026-01-15T00:00:00.000Z", "2026-02-14T00:00:00.000Z"], // janeiro → fevereiro
      ] as const) {
        const g = new InMemoryGrantedTiersRepository();
        const t = new TierService(subs, g, clock);
        const expires = Date.parse(grantedIso) + 30 * DAY;
        expect(new Date(expires).toISOString(), grantedIso).toBe(expiresIso);
        await g.grant(grant({ expiresAt: at(expires) }));
        setNow(expires - 1); expect(await t.resolve("alice"), `${grantedIso} +30d−1ms`).toBe("JUNIOR");
        setNow(expires); expect(await t.resolve("alice"), `${grantedIso} +30d`).toBe("FREE");
      }
    });

    it("PAST_DUE com o período terminando na virada do ano (2027-01-01T00:00:00Z)", async () => {
      await subs.create(sub({ status: "PAST_DUE", tier: "SENIOR", currentPeriodEnd: at(Date.parse("2027-01-01T00:00:00.000Z")) }));
      setNow(Date.parse("2026-12-31T23:59:59.999Z")); expect(await tiers.resolve("alice")).toBe("SENIOR");
      setNow(Date.parse("2027-01-01T00:00:00.000Z")); expect(await tiers.resolve("alice")).toBe("FREE");
      setNow(Date.parse("2027-01-01T00:00:00.001Z")); expect(await tiers.resolve("alice")).toBe("FREE");
    });
  });

  describe("o instante chega por PARÂMETRO, sem poluir os repositórios", () => {
    it("os repositórios decidem só pelo `now` recebido (sem relógio próprio) — mesmo dado, instantes diferentes, respostas diferentes", async () => {
      await grants.grant(grant({ expiresAt: at(T0 + 30 * DAY) }));
      await subs.create(sub({ status: "PAST_DUE", currentPeriodEnd: at(T0 + 10 * DAY) }));
      expect((await grants.findActiveForUser("alice", at(T0 + 29 * DAY)))?.tier).toBe("JUNIOR");
      expect(await grants.findActiveForUser("alice", at(T0 + 30 * DAY))).toBeNull();
      expect((await subs.findActiveForUser("alice", at(T0 + 10 * DAY - 1)))?.status).toBe("PAST_DUE");
      expect(await subs.findActiveForUser("alice", at(T0 + 10 * DAY))).toBeNull();
    });

    it("UM só instante por decisão: `resolve` lê o Clock UMA vez e usa o mesmo `now` para assinatura e concessão", async () => {
      let calls = 0;
      const counting = new (class extends Clock { now() { calls++; return at(T0); } })();
      const t = new TierService(subs, grants, counting);
      await grants.grant(grant());
      expect(await t.resolve("alice")).toBe("JUNIOR");
      expect(calls).toBe(1);
    });
  });

  describe("produção inalterada", () => {
    it("sem Clock injetado (`new TierService(subs, grants)`) usa o relógio real, como antes", async () => {
      const t = new TierService(subs, grants); // relógio real
      const real = Date.now();
      await grants.grant(grant({ id: "g_ok", tier: "SENIOR", expiresAt: new Date(real + DAY) }));
      expect(await t.resolve("alice")).toBe("SENIOR");
      const t2 = new TierService(new InMemorySubscriptionsRepository(), new InMemoryGrantedTiersRepository());
      expect(await t2.resolve("alice")).toBe("FREE");
      await subs.create(sub({ id: "sub_old", status: "PAST_DUE", tier: "JUNIOR", currentPeriodEnd: new Date(real - 1000) }));
      expect(await new TierService(subs, new InMemoryGrantedTiersRepository()).resolve("alice")).toBe("FREE"); // PAST_DUE vencida não conta
    });
  });
});
