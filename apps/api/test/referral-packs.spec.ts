/**
 * Indicação (ADR-0024, rev. 2): só recompensa quando o indicado GASTA. Além da assinatura, a COMPRA DE
 * PACOTES DE CRÉDITO conta, acumulando POR INDICADO e POR TAMANHO de pacote:
 *   a cada 3 pacotes de 10 do MESMO indicado → 2 créditos ao indicador;
 *   a cada 3 pacotes de 30 → 5; a cada 3 pacotes de 60 → 10.
 * Baldes independentes por tamanho; o resto (1 ou 2) fica acumulado; sem limite de vezes; compras de
 * indicados diferentes nunca se somam; idempotente por pagamento (webhook repetido não conta 2x).
 * Tudo em memória (sem rede): webhook do Stripe assinado de mentira, como nos outros testes de billing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Stripe from "stripe";
import { BillingService } from "../src/billing/billing.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { InMemoryPaymentIntentsRepository } from "../src/billing/payment-intents.repository";
import { InMemorySubscriptionsRepository } from "../src/billing/subscriptions.repository";
import { ReferralController } from "../src/referral/referral.controller";
import { PACK_TRIO_SIZE, PACK_TRIO_REWARD, type ReferralService } from "../src/referral/referral.service";
import { CREDIT_PACKS } from "../src/billing/credit-packs";
import type { AuthenticatedUser } from "../src/common/auth.guard";
import { makeReferralStack } from "./helpers/referral";

const WEBHOOK_SECRET = "whsec_packs_123";

function sign(body: unknown): { rawBody: Buffer; signature: string } {
  const payload = JSON.stringify(body);
  const signature = new Stripe("sk_test_fake").webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { rawBody: Buffer.from(payload), signature };
}

/** Compra de PACOTE paga (checkout.session.completed, mode payment). `sessionId` = id do pagamento. */
function packEvent(userId: string, packId: string, sessionId: string, eventId = `evt_${sessionId}`) {
  return {
    id: eventId, object: "event", type: "checkout.session.completed",
    data: { object: {
      id: sessionId, object: "checkout.session", mode: "payment", payment_status: "paid",
      client_reference_id: userId, metadata: { userId, packId }, amount_total: 1000,
    } },
  };
}

describe("Indicação — compra de pacotes de créditos do indicado (trios por tamanho, por indicado)", () => {
  let billing: BillingService; let wallet: WalletService; let referral: ReferralService;
  const deliver = (event: unknown) => { const { rawBody, signature } = sign(event); return billing.handleWebhook(rawBody, signature); };
  const credits = async (id: string) => (await wallet.get(id)).imageCredits ?? 0;
  let seq = 0;
  /** `n` compras (pagamentos DIFERENTES) do pacote `packId` por `buyer`. */
  const buy = async (buyer: string, packId: string, n = 1) => { for (let i = 0; i < n; i++) await deliver(packEvent(buyer, packId, `cs_${++seq}`)); };

  /** `owner` indicou `referred` (o cadastro só grava o vínculo — não rende nada). */
  async function invite(owner: string, referred: string) {
    const link = await referral.getOrCreateLink(owner);
    await referral.linkReferred(link.code, referred);
  }

  beforeEach(() => {
    seq = 0;
    delete process.env.DATABASE_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    wallet = new WalletService(new InMemoryWalletRepository());
    const subs = new InMemorySubscriptionsRepository();
    ({ referral } = makeReferralStack(wallet, subs));
    billing = new BillingService(wallet, new InMemoryPaymentIntentsRepository(), subs, referral);
  });
  afterEach(() => vi.restoreAllMocks());

  it("as regras: trio = 3, e 2 / 5 / 10 créditos por trio de pacotes de 10 / 30 / 60", () => {
    expect(PACK_TRIO_SIZE).toBe(3);
    expect(PACK_TRIO_REWARD).toEqual({ "pack-10": 2, "pack-30": 5, "pack-60": 10 });
    for (const p of CREDIT_PACKS) expect(PACK_TRIO_REWARD[p.id], p.id).toBeDefined(); // todo pacote do catálogo tem recompensa
  });

  it("3 pacotes de 10 do MESMO indicado → o indicador ganha 2 créditos", async () => {
    await invite("alice", "bob");
    await buy("bob", "pack-10", 3);
    expect(await credits("alice")).toBe(2);
    expect(await credits("bob")).toBe(30); // o comprador recebeu os 3 × 10 dele, como sempre
  });

  it("2 pacotes NÃO creditam; o 3º fecha o trio", async () => {
    await invite("alice", "bob");
    await buy("bob", "pack-10", 2);
    expect(await credits("alice")).toBe(0);
    await buy("bob", "pack-10", 1);
    expect(await credits("alice")).toBe(2);
  });

  it("tamanhos diferentes NÃO se misturam (baldes independentes): 2+2+2 de tamanhos distintos não fecham trio nenhum", async () => {
    await invite("alice", "bob");
    await buy("bob", "pack-10", 2);
    await buy("bob", "pack-30", 2);
    await buy("bob", "pack-60", 2);
    expect(await credits("alice")).toBe(0);

    await buy("bob", "pack-30", 1); // só o balde de 30 chega a 3
    expect(await credits("alice")).toBe(5);
    await buy("bob", "pack-60", 1);
    expect(await credits("alice")).toBe(5 + 10);
    await buy("bob", "pack-10", 1);
    expect(await credits("alice")).toBe(5 + 10 + 2);
  });

  it("6 pacotes de 10 → 4 créditos (dois trios); 9 → 6: vale sempre, sem limite", async () => {
    await invite("alice", "bob");
    await buy("bob", "pack-10", 6);
    expect(await credits("alice")).toBe(4);
    await buy("bob", "pack-10", 3);
    expect(await credits("alice")).toBe(6);
    await buy("bob", "pack-60", 9); // 3 trios de 60
    expect(await credits("alice")).toBe(6 + 30);
  });

  it("o resto acumula entre compras: 4 pacotes → 1 trio pago e 1 sobrando; +2 fecham o segundo", async () => {
    await invite("alice", "bob");
    await buy("bob", "pack-30", 4);
    expect(await credits("alice")).toBe(5);
    await buy("bob", "pack-30", 1);
    expect(await credits("alice")).toBe(5); // 5 pacotes: ainda 1 trio
    await buy("bob", "pack-30", 1);
    expect(await credits("alice")).toBe(10); // 6 pacotes: 2 trios
  });

  it("indicados DIFERENTES não somam entre si: 2 do bob + 2 da carol NÃO fecham trio", async () => {
    await invite("alice", "bob");
    await invite("alice", "carol");
    await buy("bob", "pack-10", 2);
    await buy("carol", "pack-10", 2);
    expect(await credits("alice")).toBe(0); // 4 pacotes no total, mas nenhum trio de um MESMO indicado
    await buy("bob", "pack-10", 1);
    expect(await credits("alice")).toBe(2); // o trio é do bob
    await buy("carol", "pack-10", 1);
    expect(await credits("alice")).toBe(4); // e agora o da carol, separado
  });

  it("indicados de indicadores diferentes: cada indicador recebe só pelos SEUS indicados", async () => {
    await invite("alice", "bob");
    await invite("dora", "erick");
    await buy("bob", "pack-10", 3);
    await buy("erick", "pack-10", 2);
    expect(await credits("alice")).toBe(2);
    expect(await credits("dora")).toBe(0);
  });

  it("webhook REPETIDO (retry do Stripe) não conta nem credita 2x", async () => {
    await invite("alice", "bob");
    await buy("bob", "pack-10", 2);
    const third = packEvent("bob", "pack-10", "cs_terceiro");
    await deliver(third);
    await deliver(third);                                            // reenvio idêntico
    await deliver(packEvent("bob", "pack-10", "cs_terceiro", "evt_outro_id")); // mesmo pagamento, outro id de evento
    expect(await credits("alice")).toBe(2);
    expect(await credits("bob")).toBe(30);                            // o comprador também só recebeu 3 × 10

    // reenviar compras ANTERIORES também não gera trio novo (não vira 4 compras)
    await deliver(packEvent("bob", "pack-10", "cs_1"));
    await deliver(packEvent("bob", "pack-10", "cs_2"));
    expect(await credits("alice")).toBe(2);
    await buy("bob", "pack-10", 2); // 5 pacotes de verdade: ainda 1 trio
    expect(await credits("alice")).toBe(2);
    await buy("bob", "pack-10", 1); // 6: segundo trio
    expect(await credits("alice")).toBe(4);
  });

  it("comprador SEM indicador: nada é creditado a ninguém e o webhook responde normalmente (nada quebra)", async () => {
    await expect(deliver(packEvent("zeca", "pack-10", "cs_z1"))).resolves.toEqual({ received: true });
    await buy("zeca", "pack-10", 5);
    expect(await credits("zeca")).toBe(60);
    expect(await credits("alice")).toBe(0);
    expect((await referral.getPackProgress("alice")).every((p) => p.purchased === 0 && p.triosPaid === 0)).toBe(true);
  });

  it("o próprio indicador comprando pacotes não gera nada (nem para si)", async () => {
    await invite("alice", "bob");
    await buy("alice", "pack-10", 3);
    expect(await credits("alice")).toBe(30); // só os 3 × 10 que ele comprou
  });

  it("pacote desconhecido ou pagamento sem id: no-op, sem exceção", async () => {
    await invite("alice", "bob");
    expect(await referral.recordPackPurchase("bob", "pack-999", "cs_x")).toEqual({ credited: 0, triosPaid: 0 });
    expect(await referral.recordPackPurchase("bob", "pack-10", "")).toEqual({ credited: 0, triosPaid: 0 });
    expect(await referral.recordPackPurchase("", "pack-10", "cs_y")).toEqual({ credited: 0, triosPaid: 0 });
  });

  it("falha ao creditar o indicador: o webhook FALHA (Stripe reenvia) e o reenvio paga UMA vez — sem perder nem duplicar", async () => {
    await invite("alice", "bob");
    await buy("bob", "pack-10", 2);
    const real = wallet.creditImageCredits.bind(wallet);
    vi.spyOn(wallet, "creditImageCredits").mockImplementation(async (id: string, n: number) => {
      if (id === "alice") throw new Error("db caiu");
      return real(id, n);
    });
    const third = packEvent("bob", "pack-10", "cs_falha");
    await expect(deliver(third)).rejects.toThrow(/db caiu/);
    expect(await credits("alice")).toBe(0);
    expect(await credits("bob")).toBe(30); // o comprador foi creditado uma vez

    vi.restoreAllMocks();
    await deliver(third); // retry do Stripe
    expect(await credits("alice")).toBe(2);
    expect(await credits("bob")).toBe(30); // o crédito do comprador NÃO duplicou
    await deliver(third);
    expect(await credits("alice")).toBe(2);
  });

  it("compras SIMULTÂNEAS do mesmo indicado fecham cada trio uma vez só — sem perder crédito na carteira", async () => {
    await invite("alice", "bob");
    await Promise.all(Array.from({ length: 6 }, (_, i) => deliver(packEvent("bob", "pack-10", `cs_par_${i}`))));
    expect(await credits("alice")).toBe(4); // 6 pacotes = 2 trios, nunca 3 — e os DOIS créditos chegam à carteira
    expect(await credits("bob")).toBe(60);  // os 6 × 10 do comprador também (crédito concorrente na MESMA carteira)
    const [p10] = await referral.getPackProgress("alice");
    expect(p10).toMatchObject({ purchased: 6, triosPaid: 2 }); // exatamente 2 trios reivindicados: nem 1, nem 3
    expect((await referral.getOrCreateLink("alice")).creditsEarned).toBe(4);
  });

  it("muitas compras simultâneas (9 × pack-30, 3 trios): cada trio uma vez, 15 créditos ao indicador", async () => {
    await invite("alice", "bob");
    await Promise.all(Array.from({ length: 9 }, (_, i) => deliver(packEvent("bob", "pack-30", `cs_many_${i}`))));
    expect(await credits("alice")).toBe(15);
    expect((await referral.getPackProgress("alice"))[1]).toMatchObject({ purchased: 9, triosPaid: 3 });
  });

  it("uma ÚNICA chamada paga TODOS os trios pendentes, em laço — e nunca a mais", async () => {
    await invite("alice", "bob");
    const real = wallet.creditImageCredits.bind(wallet);
    vi.spyOn(wallet, "creditImageCredits").mockImplementation(async (id: string, n: number) => {
      if (id === "alice") throw new Error("db caiu");
      return real(id, n);
    });
    // compras 1-2 não fecham trio (resolvem); de 3 a 6 o trio fecha mas o crédito ao indicador falha (o webhook responde erro)
    for (let i = 1; i <= 6; i++) await deliver(packEvent("bob", "pack-10", `cs_pend_${i}`)).catch(() => {});
    vi.restoreAllMocks();
    // as 6 compras estão registradas, os 2 trios estão pendentes (nenhum foi pago)
    expect((await referral.getPackProgress("alice"))[0]).toMatchObject({ purchased: 6, triosPaid: 0 });
    expect(await credits("alice")).toBe(0);

    await deliver(packEvent("bob", "pack-10", "cs_pend_7")); // a 7ª compra: um laço só paga os DOIS pendentes
    expect(await credits("alice")).toBe(4);                   // 7 pacotes = 2 trios (não 3)
    expect((await referral.getPackProgress("alice"))[0]).toMatchObject({ purchased: 7, triosPaid: 2 });
    await deliver(packEvent("bob", "pack-10", "cs_pend_7"));  // reenvio: nada a mais
    expect(await credits("alice")).toBe(4);
  });

  it("trio que ficou PENDENTE (crédito falhou na compra que o fechou) é pago pela PRÓXIMA compra do mesmo indicado", async () => {
    await invite("alice", "bob");
    await buy("bob", "pack-10", 2);
    const real = wallet.creditImageCredits.bind(wallet);
    vi.spyOn(wallet, "creditImageCredits").mockImplementation(async (id: string, n: number) => {
      if (id === "alice") throw new Error("db caiu");
      return real(id, n);
    });
    await expect(deliver(packEvent("bob", "pack-10", "cs_3o"))).rejects.toThrow(/db caiu/); // a 3ª fecha o trio, mas o crédito falha
    vi.restoreAllMocks();
    expect(await credits("alice")).toBe(0);

    await buy("bob", "pack-10", 1); // a 4ª compra (outro pagamento, NÃO um retry da 3ª) paga o que ficou pra trás
    expect(await credits("alice")).toBe(2);
    await buy("bob", "pack-10", 2); // 6 no total: o segundo trio
    expect(await credits("alice")).toBe(4);
  });

  it("trio pendente de OUTRO tamanho também é pago pela próxima compra do mesmo indicado (de qualquer tamanho)", async () => {
    await invite("alice", "bob");
    await buy("bob", "pack-10", 2);
    const real = wallet.creditImageCredits.bind(wallet);
    vi.spyOn(wallet, "creditImageCredits").mockImplementation(async (id: string, n: number) => {
      if (id === "alice") throw new Error("db caiu");
      return real(id, n);
    });
    await expect(deliver(packEvent("bob", "pack-10", "cs_falha_10"))).rejects.toThrow(/db caiu/);
    vi.restoreAllMocks();
    expect(await credits("alice")).toBe(0);

    await buy("bob", "pack-30", 1); // um pacote de OUTRO tamanho: não fecha trio de 30, mas acerta o de 10 que estava pendente
    expect(await credits("alice")).toBe(2);
    expect((await referral.getPackProgress("alice"))[1]).toMatchObject({ purchased: 1, triosPaid: 0 }); // o balde de 30 continua acumulando
  });

  it("pendência de um indicado NÃO é paga por compra de OUTRO indicado (cada um tem o seu balde)", async () => {
    await invite("alice", "bob");
    await invite("alice", "carol");
    await buy("bob", "pack-10", 2);
    const real = wallet.creditImageCredits.bind(wallet);
    vi.spyOn(wallet, "creditImageCredits").mockImplementation(async (id: string, n: number) => {
      if (id === "alice") throw new Error("db caiu");
      return real(id, n);
    });
    await expect(deliver(packEvent("bob", "pack-10", "cs_bob3"))).rejects.toThrow(/db caiu/);
    vi.restoreAllMocks();
    await buy("carol", "pack-10", 1); // compra da carol: não toca o trio pendente do bob
    expect(await credits("alice")).toBe(0);
    await buy("bob", "pack-30", 1);   // a do bob, sim
    expect(await credits("alice")).toBe(2);
  });

  it("contadores: `creditsEarned` soma os créditos dos trios; `conversions` (assinatura) NÃO muda", async () => {
    await invite("alice", "bob");
    await buy("bob", "pack-10", 3);
    await buy("bob", "pack-60", 3);
    const link = await referral.getOrCreateLink("alice");
    expect(link.creditsEarned).toBe(2 + 10);
    expect(link.conversions).toBe(0);
  });
});

describe("Indicação — progresso por tamanho (tela do Perfil) e fim de D1/D7", () => {
  let referral: ReferralService; let wallet: WalletService; let billing: BillingService;
  const deliver = (event: unknown) => { const { rawBody, signature } = sign(event); return billing.handleWebhook(rawBody, signature); };
  let seq = 0;
  const buy = async (buyer: string, packId: string, n = 1) => { for (let i = 0; i < n; i++) await deliver(packEvent(buyer, packId, `cs_p_${++seq}`)); };
  beforeEach(async () => {
    seq = 0;
    delete process.env.DATABASE_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    wallet = new WalletService(new InMemoryWalletRepository());
    const subs = new InMemorySubscriptionsRepository();
    ({ referral } = makeReferralStack(wallet, subs));
    billing = new BillingService(wallet, new InMemoryPaymentIntentsRepository(), subs, referral);
    const link = await referral.getOrCreateLink("alice");
    await referral.linkReferred(link.code, "bob");
    await referral.linkReferred(link.code, "carol");
  });

  it("sem compras: os três tamanhos zerados, faltam 3 para o primeiro trio", async () => {
    const packs = await referral.getPackProgress("alice");
    expect(packs.map((p) => p.packId)).toEqual(["pack-10", "pack-30", "pack-60"]);
    expect(packs.map((p) => p.credits)).toEqual([10, 30, 60]);
    expect(packs.map((p) => p.reward)).toEqual([2, 5, 10]);
    for (const p of packs) expect(p).toMatchObject({ purchased: 0, triosPaid: 0, bestProgress: 0, missing: 3 });
  });

  it("por tamanho: comprados (soma dos indicados), trios pagos e quanto falta pro próximo trio do indicado MAIS ADIANTADO", async () => {
    await buy("bob", "pack-10", 4);   // 1 trio pago + 1 sobrando
    await buy("carol", "pack-10", 2); // 2 acumulados (mais perto do trio que o bob)
    await buy("bob", "pack-60", 1);
    const [p10, p30, p60] = await referral.getPackProgress("alice");
    expect(p10).toMatchObject({ purchased: 6, triosPaid: 1, bestProgress: 2, missing: 1 }); // a carol falta 1
    expect(p30).toMatchObject({ purchased: 0, triosPaid: 0, bestProgress: 0, missing: 3 });
    expect(p60).toMatchObject({ purchased: 1, triosPaid: 0, bestProgress: 1, missing: 2 });
  });

  it("compras de quem NÃO é indicado deste indicador não entram no progresso dele", async () => {
    await buy("estranho", "pack-10", 5);
    expect((await referral.getPackProgress("alice"))[0]).toMatchObject({ purchased: 0 });
  });

  it("GET /referral: devolve os pacotes e NÃO tem mais d1/d7", async () => {
    await buy("bob", "pack-10", 3);
    const ctrl = new ReferralController(referral);
    const body = await ctrl.myLink({ id: "alice" } as unknown as AuthenticatedUser);
    expect(Object.keys(body).sort()).toEqual(["clicks", "code", "conversions", "creditsEarned", "installs", "packs", "trioSize"]);
    expect(body).not.toHaveProperty("d1");
    expect(body).not.toHaveProperty("d7");
    expect(body.trioSize).toBe(3);
    expect(body.creditsEarned).toBe(2);
    expect(body.packs[0]).toMatchObject({ packId: "pack-10", purchased: 3, triosPaid: 1 });
  });

  it("o link em memória não carrega mais d1/d7", async () => {
    const link = await referral.getOrCreateLink("alice");
    expect(link).not.toHaveProperty("d1");
    expect(link).not.toHaveProperty("d7");
  });
});
