/**
 * ADR-0029 — todo ajuste de saldo é UM comando atômico, nunca leitura seguida de escrita. Pedidos
 * SIMULTÂNEOS (`Promise.all`) não podem: gastar o mesmo crédito duas vezes (cada gasto vira uma imagem
 * paga na fal.ai), passar do saldo/limite, coletar o bônus duas vezes, nem apagar campos da carteira
 * que o pedido não conhecia. O adapter Drizzle (UPDATE ... RETURNING) não roda aqui (sem Postgres nos
 * testes); o contrato é o mesmo do adapter em memória.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { WalletService, FREEZE_COST, THAW_COST } from "../src/economy/wallet.service";
import { InMemoryWalletRepository, START } from "../src/economy/wallet.repository";
import { ImageQuotaService } from "../src/economy/image-quota.service";

const make = () => { const repo = new InMemoryWalletRepository(); return { repo, wallet: new WalletService(repo) }; };
const credits = async (w: WalletService, id: string) => (await w.get(id)).imageCredits ?? 0;
const settle = async <T>(ps: Promise<T>[]) => Promise.allSettled(ps);

describe("consumeImageCredit — atômico (o crédito nunca é gasto duas vezes)", () => {
  it("2 consumos SIMULTÂNEOS com 1 crédito → só UM passa; saldo 0", async () => {
    const { wallet } = make();
    await wallet.creditImageCredits("alice", 1);
    const r = await Promise.all([wallet.consumeImageCredit("alice"), wallet.consumeImageCredit("alice")]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await credits(wallet, "alice")).toBe(0);
  });

  it("10 consumos SIMULTÂNEOS com 5 créditos → EXATAMENTE 5 passam; saldo 0", async () => {
    const { wallet } = make();
    await wallet.creditImageCredits("alice", 5);
    const r = await Promise.all(Array.from({ length: 10 }, () => wallet.consumeImageCredit("alice")));
    expect(r.filter(Boolean)).toHaveLength(5);
    expect(r.filter((x) => !x)).toHaveLength(5);
    expect(await credits(wallet, "alice")).toBe(0);
  });

  it("o saldo NUNCA fica negativo (50 consumos simultâneos com 3 créditos)", async () => {
    const { wallet } = make();
    await wallet.creditImageCredits("alice", 3);
    const r = await Promise.all(Array.from({ length: 50 }, () => wallet.consumeImageCredit("alice")));
    expect(r.filter(Boolean)).toHaveLength(3);
    expect(await credits(wallet, "alice")).toBe(0);
    expect(await wallet.consumeImageCredit("alice")).toBe(false); // e depois disso continua recusando
    expect(await credits(wallet, "alice")).toBe(0);
  });

  it("sem crédito (ou sem carteira): falha como antes — false, e nada é criado/alterado", async () => {
    const { wallet } = make();
    expect(await wallet.consumeImageCredit("ninguem")).toBe(false);
    expect(await credits(wallet, "ninguem")).toBe(0);
  });

  it("consumo e crédito misturados em paralelo FECHAM A CONTA (qualquer ordem): passaram + saldo final = 10, nunca negativo", async () => {
    const { wallet } = make();
    await wallet.creditImageCredits("alice", 5);
    const [, , , , , ...consumes] = await Promise.all([
      ...Array.from({ length: 5 }, () => wallet.creditImageCredits("alice", 1)),
      ...Array.from({ length: 10 }, () => wallet.consumeImageCredit("alice")),
    ]);
    const passed = (consumes as boolean[]).filter(Boolean).length;
    const bal = await credits(wallet, "alice");
    expect(bal).toBeGreaterThanOrEqual(0);
    expect(passed + bal).toBe(10); // 5 iniciais + 5 novos = 10 créditos existentes: cada um foi gasto OU sobrou, nunca os dois nem nenhum
  });

  it("carteiras diferentes não se misturam", async () => {
    const { wallet } = make();
    await wallet.creditImageCredits("alice", 1);
    await wallet.creditImageCredits("bob", 1);
    const r = await Promise.all([wallet.consumeImageCredit("alice"), wallet.consumeImageCredit("alice"), wallet.consumeImageCredit("bob")]);
    expect(r).toEqual([true, false, true]);
  });
});

describe("charge / credit — atômicos e sem apagar o resto da carteira", () => {
  it("gastos SIMULTÂNEOS nunca passam do saldo: 10 × 2000 catalisadores com 12450 → exatamente 6 passam; saldo 450", async () => {
    const { wallet } = make();
    const r = await settle(Array.from({ length: 10 }, () => wallet.charge("alice", { catalisadores: 2000 })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(6);
    const rejected = r.filter((x) => x.status === "rejected") as PromiseRejectedResult[];
    expect(rejected).toHaveLength(4);
    for (const x of rejected) expect(x.reason).toBeInstanceOf(BadRequestException);
    expect((await wallet.get("alice")).catalisadores).toBe(START.catalisadores - 6 * 2000);
  });

  it("saldo insuficiente continua com a mensagem de antes (catalisadores / biomassa) e não desconta nada", async () => {
    const { wallet } = make();
    await expect(wallet.charge("alice", { catalisadores: START.catalisadores + 1 })).rejects.toThrow("Catalisadores insuficientes.");
    await expect(wallet.charge("alice", { biomassa: START.biomassa + 1 })).rejects.toThrow("Biomassa insuficiente.");
    expect(await wallet.get("alice")).toMatchObject({ catalisadores: START.catalisadores, biomassa: START.biomassa });
  });

  it("gastar TUDO que tem passa (custo = saldo) e o seguinte falha — saldo 0, nunca negativo", async () => {
    const { wallet } = make();
    await wallet.charge("alice", { catalisadores: START.catalisadores });
    expect((await wallet.get("alice")).catalisadores).toBe(0);
    await expect(wallet.charge("alice", FREEZE_COST)).rejects.toThrow(/insuficientes/);
    expect((await wallet.get("alice")).catalisadores).toBe(0);
    expect(THAW_COST.biomassa).toBe(10000);
  });

  it("créditos de recursos SIMULTÂNEOS somam todos (10 × aura 5 → 10 × 300 catalisadores, 10 × 15000 biomassa)", async () => {
    const { wallet } = make();
    await Promise.all(Array.from({ length: 10 }, () => wallet.rewardForCross("alice", 5)));
    expect(await wallet.get("alice")).toMatchObject({ catalisadores: START.catalisadores + 3000, biomassa: START.biomassa + 150000 });
  });

  it("charge, credit e claimDaily NÃO apagam os créditos comprados nem as janelas do bônus (o `save` antigo zerava tudo)", async () => {
    const { repo, wallet } = make();
    await repo.save("alice", { catalisadores: 1000, biomassa: 20000, lastDaily: "2020-01-01", lastBiweekly: "2026-09-02T00:00:00.000Z", imageCredits: 7 });

    await wallet.credit("alice", { catalisadores: 10 });
    expect(await repo.get("alice")).toMatchObject({ imageCredits: 7, lastDaily: "2020-01-01", lastBiweekly: "2026-09-02T00:00:00.000Z" });

    await wallet.charge("alice", { catalisadores: 20 });
    expect(await repo.get("alice")).toMatchObject({ imageCredits: 7, lastDaily: "2020-01-01", lastBiweekly: "2026-09-02T00:00:00.000Z" });

    await wallet.rewardForCross("alice", 5);
    expect(await repo.get("alice")).toMatchObject({ imageCredits: 7, lastBiweekly: "2026-09-02T00:00:00.000Z" });

    const d = await wallet.claimDaily("alice", "PHD");
    expect(d.claimed).toBe(true);
    expect(await repo.get("alice")).toMatchObject({ imageCredits: 7, lastBiweekly: "2026-09-02T00:00:00.000Z" });
    expect(d.wallet.imageCredits).toBe(7);
  });
});

describe("claimDaily / claimBiweekly — a janela é a condição do UPDATE", () => {
  it("5 coletas diárias SIMULTÂNEAS → UMA leva o bônus; catalisadores creditados uma vez só", async () => {
    const { wallet } = make();
    const r = await Promise.all(Array.from({ length: 5 }, () => wallet.claimDaily("alice", "PHD")));
    expect(r.filter((x) => x.claimed)).toHaveLength(1);
    expect((await wallet.get("alice")).catalisadores).toBe(START.catalisadores + 600);
    expect((await wallet.get("alice")).biomassa).toBe(START.biomassa + 30000);
  });

  it("os que NÃO levaram recebem a carteira atual (claimed: false)", async () => {
    const { wallet } = make();
    const first = await wallet.claimDaily("alice", "FREE");
    const again = await wallet.claimDaily("alice", "FREE");
    expect(again.claimed).toBe(false);
    expect(again.wallet.catalisadores).toBe(first.wallet.catalisadores);
    expect(again.gain).toBeUndefined();
  });

  it("5 coletas quinzenais SIMULTÂNEAS → UMA concede o crédito (+1, não +5)", async () => {
    const { wallet } = make();
    const r = await Promise.all(Array.from({ length: 5 }, () => wallet.claimBiweekly("alice")));
    expect(r.filter((x) => x.claimed)).toHaveLength(1);
    expect(await credits(wallet, "alice")).toBe(1);
  });

  it("janela de 15 dias: dentro dela não concede; passada, concede de novo", async () => {
    const { repo, wallet } = make();
    const day = 24 * 60 * 60 * 1000;
    await repo.save("alice", { ...START, imageCredits: 0, lastBiweekly: new Date(Date.now() - 14 * day).toISOString() });
    expect((await wallet.claimBiweekly("alice")).claimed).toBe(false);
    await repo.save("alice", { ...START, imageCredits: 0, lastBiweekly: new Date(Date.now() - 16 * day).toISOString() });
    const r = await wallet.claimBiweekly("alice");
    expect(r.claimed).toBe(true);
    expect(r.wallet.imageCredits).toBe(1);
  });
});

describe("ImageQuotaService.tryConsume — o limite mensal é a condição do UPDATE", () => {
  let saved: string | undefined; let savedDb: string | undefined;
  beforeEach(() => {
    saved = process.env.IMAGE_QUOTA_UNLIMITED; savedDb = process.env.DATABASE_URL;
    delete process.env.IMAGE_QUOTA_UNLIMITED; delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.IMAGE_QUOTA_UNLIMITED; else process.env.IMAGE_QUOTA_UNLIMITED = saved;
    if (savedDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = savedDb;
  });

  it("40 consumos SIMULTÂNEOS no SENIOR (15/mês) → EXATAMENTE 15 passam; uso = 15", async () => {
    const q = new ImageQuotaService();
    const r = await Promise.all(Array.from({ length: 40 }, () => q.tryConsume("u", "SENIOR")));
    expect(r.filter(Boolean)).toHaveLength(15);
    expect(await q.used("u")).toBe(15);
    expect(await q.tryConsume("u", "SENIOR")).toBe(false);
  });

  it("PHD (20/mês): 25 simultâneos → 20; FREE e JUNIOR (0): nenhum, e nada é gravado", async () => {
    const q = new ImageQuotaService();
    const phd = await Promise.all(Array.from({ length: 25 }, () => q.tryConsume("p", "PHD")));
    expect(phd.filter(Boolean)).toHaveLength(20);
    for (const tier of ["FREE", "JUNIOR"]) {
      const r = await Promise.all(Array.from({ length: 5 }, () => q.tryConsume(`z-${tier}`, tier)));
      expect(r.some(Boolean)).toBe(false);
      expect(await q.used(`z-${tier}`)).toBe(0);
    }
  });

  it("donos diferentes têm cotas independentes", async () => {
    const q = new ImageQuotaService();
    await Promise.all(Array.from({ length: 15 }, () => q.tryConsume("a", "SENIOR")));
    expect(await q.tryConsume("a", "SENIOR")).toBe(false);
    expect(await q.tryConsume("b", "SENIOR")).toBe(true);
  });
});
