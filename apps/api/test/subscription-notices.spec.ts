/**
 * Avisos de assinatura (ADR-0030) com RELÓGIO SIMULADO (`SystemClock.setForTesting`, nunca fake timers): 3 dias antes
 * do fim / pagamento falhou / voltou para o gratuito — por push (segundo passo do cron `push:dispatch`) e pela faixa
 * (`GET /me/subscription-notice`). Cada aviso UMA vez por período, com claim atômico. A REGRA de quando a assinatura
 * vale não muda (ADR-0029) — aqui só se confere que os avisos usam a MESMA função. Repositórios em memória e remetente
 * falso: nenhum envio real (`web-push` nem precisa estar instalada).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Tier } from "@genbreedai/shared";
import { SystemClock } from "../src/common/clock";
import { TierService } from "../src/billing/tier.service";
import { MeController } from "../src/billing/me.controller";
import { QuotaService } from "../src/quota/quota.service";
import { InMemoryUserRepository } from "../src/auth/user.repository";
import type { AuthenticatedUser } from "../src/common/auth.guard";
import {
  InMemorySubscriptionsRepository, isSubscriptionInForce, type SubscriptionRow, type SubscriptionStatus,
} from "../src/billing/subscriptions.repository";
import { InMemoryGrantedTiersRepository } from "../src/billing/granted-tiers.repository";
import {
  pushNoticeKinds, noticeCopy, pickBannerNotice, daysLeft, planName,
  EXPIRY_WARNING_DAYS, DROPPED_PUSH_WINDOW_DAYS, DROPPED_BANNER_DAYS, NOTICE_URL,
} from "../src/billing/subscription-notices";
import { PushService } from "../src/push/push.service";
import { PushSender, type PushPayload, type PushTarget } from "../src/push/push-sender";
import { InMemoryPushSubscriptionRepository } from "../src/push/push-subscription.repository";
import { dispatchSubscriptionNotices, subscriptionSummaryLines } from "../src/push/dispatch-subscriptions";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const T0 = Date.parse("2026-09-18T12:00:00.000Z");
const at = (ms: number) => new Date(ms);
const EP = (n: number | string) => `https://fcm.googleapis.com/fcm/send/device-${n}`;

const ENV_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;
let savedEnv: Record<string, string | undefined>;
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.VAPID_PUBLIC_KEY = "BPublicKeyDeTeste"; process.env.VAPID_PRIVATE_KEY = "chave-privada-de-teste"; delete process.env.VAPID_SUBJECT;
});
afterEach(() => { for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; } });

class FakeSender extends PushSender {
  calls: Array<{ target: PushTarget; payload: PushPayload }> = [];
  notReady: string | null = null;
  async ready() { if (this.notReady) throw new Error(this.notReady); }
  async send(target: PushTarget, payload: PushPayload) { this.calls.push({ target, payload }); }
}

function sub(over: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "sub_1", userId: "alice", tier: "PHD", interval: "MONTH", stripeCustomerId: "cus_1", status: "ACTIVE",
    currentPeriodEnd: at(T0 + 10 * DAY), cancelAtPeriodEnd: false, ...over,
  };
}

function build() {
  const clock = new SystemClock();
  const subs = new InMemorySubscriptionsRepository();
  const grants = new InMemoryGrantedTiersRepository();
  const tiers = new TierService(subs, grants, clock);
  const sender = new FakeSender();
  const pushRepo = new InMemoryPushSubscriptionRepository();
  const push = new PushService(pushRepo, sender, clock);
  const lines: string[] = [];
  const log = (l: string) => { lines.push(l); };
  const setNow = (ms: number) => clock.setForTesting(at(ms));
  setNow(T0);
  const run = () => dispatchSubscriptionNotices({ subscriptions: subs, push, tiers, clock }, log);
  const addDevice = (userId: string, n: number | string = userId) => pushRepo.upsert(userId, { endpoint: EP(n), p256dh: `p-${n}`, auth: `a-${n}`, userAgent: null }, at(T0));
  const titles = () => sender.calls.map((c) => c.payload.title);
  return { clock, subs, grants, tiers, sender, pushRepo, push, lines, log, setNow, run, addDevice, titles };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("a regra de quando a assinatura vale NÃO mudou (ADR-0029): os avisos usam a MESMA função", () => {
  it("`isSubscriptionInForce` concorda com `findActiveForUser` dos repositórios em toda combinação de status × momento", async () => {
    const end = T0 + 10 * DAY;
    for (const status of ["ACTIVE", "PAST_DUE", "CANCELED", "INCOMPLETE"] as SubscriptionStatus[]) {
      const repo = new InMemorySubscriptionsRepository();
      await repo.create(sub({ status, currentPeriodEnd: at(end) }));
      for (const now of [T0, end - 1, end, end + 1, end + 30 * DAY]) {
        const viaRepo = (await repo.findActiveForUser("alice", at(now))) !== null;
        expect(isSubscriptionInForce({ status, currentPeriodEnd: at(end) }, at(now)), `${status} @${now - end}`).toBe(viaRepo);
      }
    }
  });
  it("as constantes combinam com o pedido: 3 dias antes; queda recente = 2 dias (push) e 7 dias (faixa)", () => {
    expect(EXPIRY_WARNING_DAYS).toBe(3);
    expect(DROPPED_PUSH_WINDOW_DAYS).toBe(2);
    expect(DROPPED_BANNER_DAYS).toBe(7);
    expect(NOTICE_URL).toBe("/app/planos");
  });
});

describe("quais avisos uma assinatura merece (função pura)", () => {
  const end = T0 + 10 * DAY;

  it("ACTIVE que RENOVA sozinha (sem cancelamento agendado) NUNCA é avisada de vencimento — nem a 1 ms do fim", () => {
    const r = sub({ status: "ACTIVE", cancelAtPeriodEnd: false, currentPeriodEnd: at(end) });
    for (const now of [end - 3 * DAY, end - DAY, end - 1, end, end + DAY]) expect(pushNoticeKinds(r, at(now)), String(now - end)).toEqual([]);
  });

  it("ACTIVE com cancelamento agendado: avisa a partir de EXATAMENTE 3 dias antes; antes disso não; no instante do fim não (o webhook vira CANCELED)", () => {
    const r = sub({ status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: at(end) });
    expect(pushNoticeKinds(r, at(end - 3 * DAY - 1))).toEqual([]);
    expect(pushNoticeKinds(r, at(end - 3 * DAY))).toEqual(["EXPIRING"]);
    expect(pushNoticeKinds(r, at(end - 1))).toEqual(["EXPIRING"]);
    expect(pushNoticeKinds(r, at(end))).toEqual([]);
  });

  it("PAST_DUE em vigor: avisa que o pagamento falhou; a 3 dias do fim avisa TAMBÉM que vence", () => {
    const r = sub({ status: "PAST_DUE", currentPeriodEnd: at(end) });
    expect(pushNoticeKinds(r, at(T0))).toEqual(["PAST_DUE"]);
    expect(pushNoticeKinds(r, at(end - 3 * DAY))).toEqual(["PAST_DUE", "EXPIRING"]);
  });

  it("caiu de fato: PAST_DUE com o período vencido (regra do ADR-0029) e CANCELED → DROPPED, só se recente (≤ 2 dias)", () => {
    const pastDue = sub({ status: "PAST_DUE", currentPeriodEnd: at(end) });
    expect(pushNoticeKinds(pastDue, at(end))).toEqual(["DROPPED"]);
    expect(pushNoticeKinds(pastDue, at(end + 2 * DAY))).toEqual(["DROPPED"]);
    expect(pushNoticeKinds(pastDue, at(end + 2 * DAY + 1))).toEqual([]);
    const canceled = sub({ status: "CANCELED", currentPeriodEnd: at(end) });
    expect(pushNoticeKinds(canceled, at(end + HOUR))).toEqual(["DROPPED"]);
    expect(pushNoticeKinds(canceled, at(end + 3 * DAY))).toEqual([]);
    expect(pushNoticeKinds(sub({ status: "CANCELED", currentPeriodEnd: at(T0 + 5 * DAY) }), at(T0))).toEqual(["DROPPED"]); // cancelamento imediato (fim no futuro)
  });

  it("INCOMPLETE nunca avisa (o jogador nunca teve o plano)", () => {
    for (const now of [T0, end, end + DAY]) expect(pushNoticeKinds(sub({ status: "INCOMPLETE" }), at(now))).toEqual([]);
  });
});

describe("textos (push e faixa usam os MESMOS)", () => {
  const end = T0 + 10 * DAY;
  it("3 dias antes: 'Sua assinatura vence em 3 dias', com o nome do plano; conta os dias que faltam", () => {
    const r = sub({ tier: "PHD", cancelAtPeriodEnd: true, currentPeriodEnd: at(end) });
    const c3 = noticeCopy("EXPIRING", r, at(end - 3 * DAY));
    expect(c3.title).toBe("Sua assinatura vence em 3 dias");
    expect(c3.body).toContain("PhD");
    expect(c3.body).toMatch(/não será renovado/);
    expect(noticeCopy("EXPIRING", r, at(end - 2 * DAY)).title).toBe("Sua assinatura vence em 2 dias");
    expect(noticeCopy("EXPIRING", r, at(end - HOUR)).title).toBe("Sua assinatura vence em 1 dia");
    expect(daysLeft(r, at(end - 3 * DAY))).toBe(3);
    expect(planName("JUNIOR")).toBe("Junior"); expect(planName("SENIOR")).toBe("Senior"); expect(planName("PHD")).toBe("PhD");
  });

  it("pagamento falhou: título exato e o que acontece se não for resolvido", () => {
    const c = noticeCopy("PAST_DUE", sub({ tier: "SENIOR", status: "PAST_DUE", currentPeriodEnd: at(end) }), at(T0));
    expect(c.title).toBe("O pagamento da sua assinatura falhou");
    expect(c.body).toContain("Senior");
    expect(c.body).toMatch(/segue ativo até \d{2}\/\d{2}/);
    expect(c.body).toMatch(/volta para o plano gratuito/);
  });

  it("caiu: 'Sua conta voltou para o plano gratuito'", () => {
    const c = noticeCopy("DROPPED", sub({ tier: "JUNIOR", status: "CANCELED" }), at(end + HOUR));
    expect(c.title).toBe("Sua conta voltou para o plano gratuito");
    expect(c.body).toContain("Junior");
  });

  it("vence por PAGAMENTO pendente (não por escolha): o corpo pede para atualizar o pagamento", () => {
    const c = noticeCopy("EXPIRING", sub({ status: "PAST_DUE", currentPeriodEnd: at(end) }), at(end - 2 * DAY));
    expect(c.body).toMatch(/Atualize o pagamento/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("push (segundo passo do cron push:dispatch) — cada aviso no momento certo, UMA vez por período", () => {
  it("3 dias antes: nada 1 ms antes da janela; dispara em EXATAMENTE end−3d, com título/corpo/clique certos", async () => {
    const t = build();
    await t.addDevice("alice");
    const end = T0 + 10 * DAY;
    await t.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(end) }));

    t.setNow(end - 3 * DAY - 1);
    const early = await t.run();
    expect(early.reivindicados).toBe(0);
    expect(t.sender.calls).toEqual([]);

    t.setNow(end - 3 * DAY);
    const s = await t.run();
    expect(s).toMatchObject({ disabled: false, candidatas: 1, reivindicados: 1, avisados: 1, falhas: 0 });
    expect(s.porTipo).toEqual({ EXPIRING: 1, PAST_DUE: 0, DROPPED: 0 });
    expect(t.sender.calls).toHaveLength(1);
    const p = t.sender.calls[0]!.payload;
    expect(p.title).toBe("Sua assinatura vence em 3 dias");
    expect(p.body).toContain("PhD");
    expect(p.url).toBe("/app/planos");        // o clique leva à página de planos
    expect(p.icon).toBe("/icon-192.png");
    expect(p.tag).toContain("assinatura-EXPIRING-sub_1");
  });

  it("NENHUM aviso dispara duas vezes: reexecutar (5 min, 1 h, o resto do período) não reenvia", async () => {
    const t = build();
    await t.addDevice("alice");
    const end = T0 + 10 * DAY;
    await t.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(end) }));
    t.setNow(end - 3 * DAY);
    await t.run();
    for (const ms of [end - 3 * DAY + 5 * 60_000, end - 3 * DAY + HOUR, end - DAY, end - 1]) { t.setNow(ms); const s = await t.run(); expect(s.reivindicados, String(ms - end)).toBe(0); }
    expect(t.sender.calls).toHaveLength(1);
  });

  it("chegou atrasado na janela (cron parado): avisa com os dias que FALTAM ('vence em 2 dias'), uma vez", async () => {
    const t = build();
    await t.addDevice("alice");
    const end = T0 + 10 * DAY;
    await t.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(end) }));
    t.setNow(end - 2 * DAY);
    await t.run();
    expect(t.titles()).toEqual(["Sua assinatura vence em 2 dias"]);
  });

  it("assinatura que RENOVA sozinha (sem cancelamento) não gera aviso nenhum — nem na janela, nem no vencimento", async () => {
    const t = build();
    await t.addDevice("alice");
    const end = T0 + 10 * DAY;
    await t.subs.create(sub({ status: "ACTIVE", cancelAtPeriodEnd: false, currentPeriodEnd: at(end) }));
    for (const ms of [end - 3 * DAY, end - DAY, end - 1, end, end + HOUR]) { t.setNow(ms); await t.run(); }
    expect(t.sender.calls).toEqual([]);
  });

  it("RENOVADA antes do vencimento: o fim do período andou (ou o cancelamento foi desfeito) → o aviso NÃO dispara", async () => {
    // (a) jogador desfez o cancelamento antes da janela
    const a = build();
    await a.addDevice("alice");
    const end = T0 + 10 * DAY;
    await a.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(end) }));
    a.setNow(end - 5 * DAY);
    await a.subs.updateLifecycle("sub_1", { status: "ACTIVE", currentPeriodEnd: at(end), cancelAtPeriodEnd: false });
    for (const ms of [end - 3 * DAY, end - DAY]) { a.setNow(ms); await a.run(); }
    expect(a.sender.calls).toEqual([]);

    // (b) o fim do período foi para +30 dias (renovou) antes de chegar a janela do fim antigo
    const b = build();
    await b.addDevice("alice");
    await b.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(end) }));
    b.setNow(end - 4 * DAY);
    await b.subs.updateLifecycle("sub_1", { status: "ACTIVE", currentPeriodEnd: at(end + 30 * DAY), cancelAtPeriodEnd: false });
    for (const ms of [end - 3 * DAY, end, end + DAY]) { b.setNow(ms); await b.run(); }
    expect(b.sender.calls).toEqual([]);
  });

  it("novo período (renovou) libera o aviso de novo: uma vez POR período", async () => {
    const t = build();
    await t.addDevice("alice");
    const end1 = T0 + 10 * DAY;
    await t.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(end1) }));
    t.setNow(end1 - 3 * DAY); await t.run();
    expect(t.sender.calls).toHaveLength(1);
    // renovou, e no ciclo seguinte cancelou de novo
    const end2 = end1 + 30 * DAY;
    t.setNow(end1 + HOUR);
    await t.subs.updateLifecycle("sub_1", { status: "ACTIVE", currentPeriodEnd: at(end2), cancelAtPeriodEnd: true });
    t.setNow(end2 - 3 * DAY); await t.run();
    expect(t.sender.calls).toHaveLength(2);
    t.setNow(end2 - 1 * DAY); await t.run();
    expect(t.sender.calls).toHaveLength(2); // e neste período também só uma
  });

  it("vencimento com falha: PAST_DUE em vigor → 'O pagamento da sua assinatura falhou', uma vez; recuperou → nada mais", async () => {
    const t = build();
    await t.addDevice("alice");
    const end = T0 + 10 * DAY;
    await t.subs.create(sub({ currentPeriodEnd: at(end) }));
    await t.run(); expect(t.sender.calls).toEqual([]); // ainda ACTIVE
    await t.subs.updateStatus("sub_1", "PAST_DUE");    // invoice.payment_failed
    const s = await t.run();
    expect(s.porTipo.PAST_DUE).toBe(1);
    expect(t.titles()).toEqual(["O pagamento da sua assinatura falhou"]);
    expect(t.sender.calls[0]!.payload.url).toBe("/app/planos");
    t.setNow(T0 + HOUR); await t.run(); t.setNow(T0 + 2 * DAY); await t.run();
    expect(t.sender.calls).toHaveLength(1); // uma vez
    await t.subs.updateStatus("sub_1", "ACTIVE");     // o Stripe recuperou o pagamento
    t.setNow(T0 + 3 * DAY); await t.run();
    expect(t.sender.calls).toHaveLength(1);
  });

  it("caiu de fato: PAST_DUE que passou do período (sem pagamento) → 'Sua conta voltou para o plano gratuito', uma vez — e o aviso de falha NÃO é reenviado", async () => {
    const t = build();
    await t.addDevice("alice");
    const end = T0 + 10 * DAY;
    await t.subs.create(sub({ status: "PAST_DUE", currentPeriodEnd: at(end) }));
    await t.run(); // dia 0: pagamento falhou
    expect(t.titles()).toEqual(["O pagamento da sua assinatura falhou"]);
    t.setNow(end - 1); await t.run();  // 1 ms antes do fim: ainda em vigor (envia só o "vence em breve", que é outro aviso)
    t.setNow(end); await t.run();      // venceu: pela regra do ADR-0029 já é Free
    expect(t.titles().filter((x) => x === "Sua conta voltou para o plano gratuito")).toHaveLength(1);
    t.setNow(end + HOUR); await t.run(); t.setNow(end + DAY); await t.run();
    expect(t.titles().filter((x) => x === "Sua conta voltou para o plano gratuito")).toHaveLength(1);
    expect(t.titles().filter((x) => x === "O pagamento da sua assinatura falhou")).toHaveLength(1);
  });

  it("QUEM CANCELOU DE PROPÓSITO também é avisado: 3 dias antes E ao cair (uma vez cada)", async () => {
    const t = build();
    await t.addDevice("alice");
    const end = T0 + 10 * DAY;
    await t.subs.create(sub({ tier: "SENIOR", cancelAtPeriodEnd: true, currentPeriodEnd: at(end) }));
    t.setNow(end - 3 * DAY); await t.run();
    t.setNow(end - 1);      await t.run();
    await t.subs.updateStatus("sub_1", "CANCELED"); // customer.subscription.deleted, no fim do período
    t.setNow(end + 5 * 60_000); await t.run();
    t.setNow(end + HOUR);       await t.run();
    expect(t.titles()).toEqual(["Sua assinatura vence em 3 dias", "Sua conta voltou para o plano gratuito"]);
  });

  it("'voltou para o gratuito' só se o jogador está MESMO no Free: com uma concessão em vigor o aviso é marcado mas NÃO enviado (pulado)", async () => {
    const t = build();
    await t.addDevice("alice");
    const end = T0 + 10 * DAY;
    await t.subs.create(sub({ status: "CANCELED", currentPeriodEnd: at(end) }));
    await t.grants.grant({ id: "g1", userId: "alice", tier: "JUNIOR", expiresAt: at(end + 20 * DAY), reason: "REFERRAL_PHD:bob:sub_phd" });
    t.setNow(end + HOUR);
    const s = await t.run();
    expect(s).toMatchObject({ reivindicados: 1, pulados: 1, avisados: 0 });
    expect(t.sender.calls).toEqual([]);
    t.setNow(end + 2 * HOUR); await t.run();
    expect(t.sender.calls).toEqual([]); // marcado: não reenvia depois
  });

  it("quedas ANTIGAS não geram push em massa no primeiro rodar (só ≤ 2 dias); INCOMPLETE nunca avisa", async () => {
    const t = build();
    await t.addDevice("alice"); await t.addDevice("bob"); await t.addDevice("carol");
    await t.subs.create(sub({ id: "s_old", userId: "alice", status: "CANCELED", currentPeriodEnd: at(T0 - 3 * DAY) }));
    await t.subs.create(sub({ id: "s_inc", userId: "bob", status: "INCOMPLETE", currentPeriodEnd: at(T0 - HOUR) }));
    await t.subs.create(sub({ id: "s_new", userId: "carol", status: "CANCELED", currentPeriodEnd: at(T0 - HOUR) }));
    const s = await t.run();
    expect(s.reivindicados).toBe(1);
    expect(t.sender.calls.map((c) => c.target.endpoint)).toEqual([EP("carol")]);
  });

  it("dono SEM dispositivo de push: o aviso é reivindicado (conta 'sem push'; a faixa cobre) e assinar o push depois NÃO gera aviso velho", async () => {
    const t = build();
    const end = T0 + 10 * DAY;
    await t.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(end) }));
    t.setNow(end - 3 * DAY);
    const s = await t.run();
    expect(s).toMatchObject({ reivindicados: 1, semAssinatura: 1, avisados: 0 });
    await t.addDevice("alice");
    t.setNow(end - 2 * DAY);
    expect((await t.run()).reivindicados).toBe(0);
    expect(t.sender.calls).toEqual([]);
  });

  it("DUAS execuções SIMULTÂNEAS avisam cada aviso UMA vez só (claim atômico)", async () => {
    const t = build();
    for (let i = 0; i < 5; i++) {
      await t.addDevice(`u${i}`);
      await t.subs.create(sub({ id: `s${i}`, userId: `u${i}`, cancelAtPeriodEnd: true, currentPeriodEnd: at(T0 + 2 * DAY) }));
    }
    const [a, b] = await Promise.all([t.run(), t.run()]);
    expect(a.reivindicados + b.reivindicados).toBe(5);
    expect(t.sender.calls).toHaveLength(5);
    expect(new Set(t.sender.calls.map((c) => c.target.endpoint)).size).toBe(5);
  });

  it("no mesmo instante, PAST_DUE a 3 dias do fim → DOIS avisos distintos (falhou + vence), cada um uma vez", async () => {
    const t = build();
    await t.addDevice("alice");
    await t.subs.create(sub({ status: "PAST_DUE", currentPeriodEnd: at(T0 + 2 * DAY) }));
    await t.run(); await t.run();
    expect(t.titles().sort()).toEqual(["O pagamento da sua assinatura falhou", "Sua assinatura vence em 2 dias"].sort());
  });

  it("virada de mês e de ano: fim em 2027-01-02T09:00Z → 3 dias antes cai em 2026-12-30T09:00Z", async () => {
    const t = build();
    await t.addDevice("alice");
    const end = Date.parse("2027-01-02T09:00:00.000Z");
    await t.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(end) }));
    t.setNow(Date.parse("2026-12-30T08:59:59.999Z")); await t.run();
    expect(t.sender.calls).toEqual([]);
    t.setNow(Date.parse("2026-12-30T09:00:00.000Z")); await t.run();
    expect(t.titles()).toEqual(["Sua assinatura vence em 3 dias"]);
    // fevereiro bissexto: fim em 2028-03-01T00:00Z → janela abre em 2028-02-27T00:00Z
    const t2 = build();
    await t2.addDevice("alice");
    await t2.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(Date.parse("2028-03-01T00:00:00.000Z")) }));
    t2.setNow(Date.parse("2028-02-26T23:59:59.999Z")); await t2.run();
    expect(t2.sender.calls).toEqual([]);
    t2.setNow(Date.parse("2028-02-27T00:00:00.000Z")); await t2.run();
    expect(t2.sender.calls).toHaveLength(1);
  });

  it("usuários diferentes não se misturam", async () => {
    const t = build();
    await t.addDevice("alice"); await t.addDevice("bob");
    await t.subs.create(sub({ id: "sa", userId: "alice", cancelAtPeriodEnd: true, currentPeriodEnd: at(T0 + 2 * DAY) }));
    await t.subs.create(sub({ id: "sb", userId: "bob", status: "ACTIVE", cancelAtPeriodEnd: false, currentPeriodEnd: at(T0 + 2 * DAY) }));
    await t.run();
    expect(t.sender.calls.map((c) => c.target.endpoint)).toEqual([EP("alice")]);
  });

  it("SEM chaves VAPID: recurso desligado — nada é reivindicado; ao ligar, os avisos ainda valem", async () => {
    const t = build();
    await t.addDevice("alice");
    await t.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(T0 + 2 * DAY) }));
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    const off = await t.run();
    expect(off.disabled).toBe(true);
    expect(t.sender.calls).toEqual([]);
    expect(t.lines.join("\n")).toMatch(/DESLIGADOS/);
    process.env.VAPID_PUBLIC_KEY = "BPublicKeyDeTeste"; process.env.VAPID_PRIVATE_KEY = "chave-privada-de-teste";
    expect((await t.run()).reivindicados).toBe(1);
  });

  it("chaves definidas mas a biblioteca web-push ausente: LANÇA antes de reivindicar qualquer aviso", async () => {
    const t = build();
    t.sender.notReady = "web-push não está instalado";
    await t.addDevice("alice");
    await t.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(T0 + 2 * DAY) }));
    await expect(t.run()).rejects.toThrow(/web-push não está instalado/);
    t.sender.notReady = null;
    expect((await t.run()).reivindicados).toBe(1); // nada foi consumido pela tentativa que falhou
  });

  it("NUNCA em silêncio: o resumo é impresso mesmo sem nada a fazer", async () => {
    const t = build();
    const s = await t.run();
    expect(s).toMatchObject({ disabled: false, candidatas: 0, reivindicados: 0, avisados: 0, semAssinatura: 0, pulados: 0, falhas: 0 });
    expect(t.lines.some((l) => l.startsWith("ASSINATURAS — CANDIDATAS: 0"))).toBe(true);
    expect(subscriptionSummaryLines(s)).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("faixa no app — GET /me/subscription-notice", () => {
  function makeController() {
    const t = build();
    const controller = new MeController(t.tiers, new QuotaService(t.clock), new InMemoryUserRepository(), t.subs, t.clock);
    const user = (id = "alice") => ({ id, tier: "FREE" as Tier }) as unknown as AuthenticatedUser;
    const notice = async (id = "alice") => (await controller.subscriptionNotice(user(id))).notice;
    return { ...t, notice };
  }
  const end = T0 + 10 * DAY;

  it("sem assinatura → nenhuma faixa", async () => {
    const c = makeController();
    expect(await c.notice()).toBeNull();
  });

  it("vence em breve (cancelamento agendado): só na janela de 3 dias; título com os dias, link para planos, chave de dispensa por período", async () => {
    const c = makeController();
    await c.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(end) }));
    c.setNow(end - 3 * DAY - 1); expect(await c.notice()).toBeNull();
    c.setNow(end - 3 * DAY);
    const n = await c.notice();
    expect(n).toMatchObject({ kind: "EXPIRING", subscriptionId: "sub_1", tier: "PHD", title: "Sua assinatura vence em 3 dias", url: "/app/planos" });
    expect(n!.dismissKey).toBe(`EXPIRING:sub_1:${at(end).toISOString()}`);
    expect(n!.periodEnd).toBe(at(end).toISOString());
  });

  it("assinatura que renova sozinha (ACTIVE, sem cancelamento) → nunca há faixa", async () => {
    const c = makeController();
    await c.subs.create(sub({ status: "ACTIVE", cancelAtPeriodEnd: false, currentPeriodEnd: at(end) }));
    for (const ms of [T0, end - 3 * DAY, end - 1, end, end + DAY]) { c.setNow(ms); expect(await c.notice(), String(ms - end)).toBeNull(); }
  });

  it("pagamento falhou (PAST_DUE em vigor) → faixa de falha; passou do período → 'voltou para o plano gratuito'", async () => {
    const c = makeController();
    await c.subs.create(sub({ status: "PAST_DUE", currentPeriodEnd: at(end) }));
    expect((await c.notice())?.kind).toBe("PAST_DUE");
    expect((await c.notice())?.title).toBe("O pagamento da sua assinatura falhou");
    c.setNow(end);
    const dropped = await c.notice();
    expect(dropped?.kind).toBe("DROPPED");
    expect(dropped?.title).toBe("Sua conta voltou para o plano gratuito");
  });

  it("caiu (CANCELED): a faixa fica por 7 dias e some; INCOMPLETE nunca mostra", async () => {
    const c = makeController();
    await c.subs.create(sub({ status: "CANCELED", currentPeriodEnd: at(end) }));
    for (const ms of [end, end + DAY, end + 7 * DAY]) { c.setNow(ms); expect((await c.notice())?.kind, String(ms - end)).toBe("DROPPED"); }
    c.setNow(end + 7 * DAY + 1); expect(await c.notice()).toBeNull();

    const c2 = makeController();
    await c2.subs.create(sub({ status: "INCOMPLETE", currentPeriodEnd: at(T0 - HOUR) }));
    expect(await c2.notice()).toBeNull();
  });

  it("SOME quando a assinatura volta a ficar ativa: pagamento recuperado; cancelamento desfeito; assinou de novo depois de cair", async () => {
    // pagamento recuperado
    const a = makeController();
    await a.subs.create(sub({ status: "PAST_DUE", currentPeriodEnd: at(end) }));
    expect(await a.notice()).not.toBeNull();
    await a.subs.updateLifecycle("sub_1", { status: "ACTIVE", currentPeriodEnd: at(end + 30 * DAY), cancelAtPeriodEnd: false });
    expect(await a.notice()).toBeNull();
    // cancelamento desfeito dentro da janela
    const b = makeController();
    await b.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(end) }));
    b.setNow(end - 2 * DAY); expect((await b.notice())?.kind).toBe("EXPIRING");
    await b.subs.updateLifecycle("sub_1", { status: "ACTIVE", currentPeriodEnd: at(end), cancelAtPeriodEnd: false });
    expect(await b.notice()).toBeNull();
    // caiu e assinou de novo (nova linha ACTIVE em vigor)
    const c = makeController();
    await c.subs.create(sub({ id: "sub_old", status: "CANCELED", currentPeriodEnd: at(T0 - HOUR) }));
    expect((await c.notice())?.kind).toBe("DROPPED");
    await c.subs.create(sub({ id: "sub_new", status: "ACTIVE", currentPeriodEnd: at(T0 + 30 * DAY) }));
    expect(await c.notice()).toBeNull();
  });

  it("'voltou para o gratuito' não aparece se uma concessão em vigor mantém o jogador acima do Free", async () => {
    const c = makeController();
    await c.subs.create(sub({ status: "CANCELED", currentPeriodEnd: at(T0 - HOUR) }));
    expect((await c.notice())?.kind).toBe("DROPPED");
    await c.grants.grant({ id: "g1", userId: "alice", tier: "JUNIOR", expiresAt: at(T0 + 20 * DAY), reason: "REFERRAL_PHD:bob:sub_phd" });
    expect(await c.notice()).toBeNull();
  });

  it("mais urgente primeiro: entre vários avisos, pagamento falhou > vence em breve > voltou para o gratuito", () => {
    const rows = [
      sub({ id: "s_drop", status: "CANCELED", currentPeriodEnd: at(T0 - HOUR) }),
      sub({ id: "s_exp", cancelAtPeriodEnd: true, currentPeriodEnd: at(T0 + 2 * DAY) }),
      sub({ id: "s_pd", status: "PAST_DUE", currentPeriodEnd: at(T0 + 20 * DAY) }),
    ];
    expect(pickBannerNotice(rows, at(T0), "FREE")?.kind).toBe("PAST_DUE");
    expect(pickBannerNotice(rows.slice(0, 2), at(T0), "FREE")?.kind).toBe("EXPIRING");
    expect(pickBannerNotice(rows.slice(0, 1), at(T0), "FREE")?.kind).toBe("DROPPED");
  });

  it("o texto da faixa é o MESMO do push", async () => {
    const c = makeController();
    await c.addDevice("alice");
    const e = T0 + 3 * DAY;
    await c.subs.create(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(e) }));
    const banner = await c.notice();
    await c.run();
    expect(c.sender.calls[0]!.payload.title).toBe(banner!.title);
    expect(c.sender.calls[0]!.payload.body).toBe(banner!.body);
  });
});
