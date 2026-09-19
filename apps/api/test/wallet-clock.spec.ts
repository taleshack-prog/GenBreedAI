/**
 * Regra de negócio dependente de tempo usa `Clock`, nunca a data do sistema (ADR-0029, regra 3 do CLAUDE.md):
 * bônus DIÁRIO (dia civil em UTC), bônus QUINZENAL (janela móvel de 15 dias) e cota MENSAL de retratos extras
 * (mês em UTC) — agora testáveis com relógio simulado (`SystemClock.setForTesting`, nunca fake timers).
 *
 * ATENÇÃO — "dia" e "mês" são em UTC: no fuso de São Paulo (UTC−3) o dia do bônus diário e o mês da cota viram às
 * 21:00, não à meia-noite. Os testes marcados "COMPORTAMENTO ATUAL" documentam isso; é PONTO DE DECISÃO DE PRODUTO
 * (a vaga de nascimento diária de SENIOR/PHD usa o dia civil de São Paulo). Se o produto mudar a regra, esses testes
 * mudam junto — não são um endosso do comportamento.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { Tier } from "@genbreedai/shared";
import { SystemClock } from "../src/common/clock";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository, START } from "../src/economy/wallet.repository";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { GeneBankController } from "../src/gene-bank/gene-bank.controller";
import { GeneBankService } from "../src/gene-bank/gene-bank.service";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { CrossService } from "../src/cross/cross.service";
import { TierService } from "../src/billing/tier.service";

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);

function make() {
  const clock = new SystemClock();
  const repo = new InMemoryWalletRepository();
  const wallet = new WalletService(repo, clock);
  const setNow = (iso: string) => clock.setForTesting(at(iso));
  return { clock, repo, wallet, setNow };
}
const credits = async (w: WalletService, id: string) => (await w.get(id)).imageCredits ?? 0;

describe("bônus DIÁRIO — o dia vem do Clock (dia civil em UTC)", () => {
  it("coletei hoje → recusa a 2ª (qualquer horário do mesmo dia); a carteira não muda", async () => {
    const { wallet, setNow } = make();
    setNow("2026-06-10T15:00:00.000Z");
    const a = await wallet.claimDaily("alice", "PHD");
    expect(a.claimed).toBe(true);
    expect(a.wallet.catalisadores).toBe(START.catalisadores + 600);
    for (const t of ["2026-06-10T15:00:01.000Z", "2026-06-10T20:00:00.000Z", "2026-06-10T23:59:59.999Z"]) {
      setNow(t);
      const b = await wallet.claimDaily("alice", "PHD");
      expect(b.claimed, t).toBe(false);
      expect(b.wallet.catalisadores).toBe(a.wallet.catalisadores);
    }
  });

  it("passou a meia-noite (UTC) → aceita de novo, e de novo recusa dentro do novo dia", async () => {
    const { wallet, setNow } = make();
    setNow("2026-06-10T23:59:59.999Z");
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
    setNow("2026-06-11T00:00:00.000Z");
    const next = await wallet.claimDaily("alice", "FREE");
    expect(next.claimed).toBe(true);
    expect(next.wallet.catalisadores).toBe(START.catalisadores + 2 * 80);
    setNow("2026-06-11T10:00:00.000Z");
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(false);
  });

  it("duas (ou cinco) coletas SIMULTÂNEAS no mesmo dia → UMA só leva o bônus", async () => {
    const { wallet, setNow } = make();
    setNow("2026-06-10T12:00:00.000Z");
    const r = await Promise.all(Array.from({ length: 5 }, () => wallet.claimDaily("alice", "SENIOR")));
    expect(r.filter((x) => x.claimed)).toHaveLength(1);
    expect((await wallet.get("alice")).catalisadores).toBe(START.catalisadores + 300);
  });

  it("dias consecutivos por vários dias: uma coleta por dia, sempre", async () => {
    const { wallet, setNow } = make();
    let claims = 0;
    for (let d = 0; d < 10; d++) {
      for (const h of ["01:00", "13:00", "22:00"]) {
        setNow(`2026-06-${String(10 + d).padStart(2, "0")}T${h}:00.000Z`);
        if ((await wallet.claimDaily("alice", "FREE")).claimed) claims++;
      }
    }
    expect(claims).toBe(10);
    expect((await wallet.get("alice")).catalisadores).toBe(START.catalisadores + 10 * 80);
  });

  it("virada de MÊS, de ANO e ano bissexto não quebram a conta", async () => {
    const { wallet, setNow } = make();
    const seq: Array<[string, boolean]> = [
      ["2026-01-31T12:00:00.000Z", true], ["2026-01-31T23:00:00.000Z", false],
      ["2026-02-01T00:30:00.000Z", true],                                     // fim de janeiro → fevereiro
      ["2026-12-31T12:00:00.000Z", true], ["2026-12-31T23:59:59.000Z", false],
      ["2027-01-01T00:00:00.000Z", true],                                     // virada de ano
      ["2028-02-28T12:00:00.000Z", true], ["2028-02-29T00:00:00.000Z", true], // 29/02 existe (bissexto)
      ["2028-02-29T18:00:00.000Z", false], ["2028-03-01T00:00:00.000Z", true],
    ];
    for (const [t, expected] of seq) {
      setNow(t);
      expect((await wallet.claimDaily("alice", "FREE")).claimed, t).toBe(expected);
    }
  });

  it("COMPORTAMENTO ATUAL (dia em UTC): às 21:00 de São Paulo o 'dia' vira — quem coletou às 20:30 (BRT) coleta de novo às 21:30 (BRT) do MESMO dia civil local", async () => {
    const { wallet, setNow } = make();
    setNow("2026-06-10T23:30:00.000Z"); // 20:30 em São Paulo (UTC−3)
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
    setNow("2026-06-11T00:30:00.000Z"); // 21:30 em São Paulo — ainda dia 10 lá, já dia 11 em UTC
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
  });

  it("produção inalterada: sem Clock injetado (`new WalletService(repo)`) usa o relógio real", async () => {
    const wallet = new WalletService(new InMemoryWalletRepository());
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(false);
  });
});

describe("bônus QUINZENAL — janela móvel de 15 dias do Clock", () => {
  it("coletei agora → recusa na hora; 14 dias depois → recusa; 15 dias depois → aceita (o limite é inclusivo)", async () => {
    const { wallet, setNow } = make();
    setNow("2026-06-01T12:00:00.000Z");
    const first = await wallet.claimBiweekly("alice");
    expect(first.claimed).toBe(true);
    expect(first.wallet.imageCredits).toBe(1);

    expect((await wallet.claimBiweekly("alice")).claimed).toBe(false); // agora mesmo
    const t0 = at("2026-06-01T12:00:00.000Z").getTime();
    for (const [label, ms] of [["1 dia", DAY], ["14 dias", 14 * DAY], ["14 dias e 23h59", 14 * DAY + 23 * 3600 * 1000 + 59 * 60 * 1000]] as const) {
      setNow(new Date(t0 + ms).toISOString());
      expect((await wallet.claimBiweekly("alice")).claimed, label).toBe(false);
    }
    expect(await credits(wallet, "alice")).toBe(1);

    setNow(new Date(t0 + 15 * DAY).toISOString());
    const again = await wallet.claimBiweekly("alice");
    expect(again.claimed).toBe(true);
    expect(again.wallet.imageCredits).toBe(2);
  });

  it("a janela recomeça a cada coleta: aceitou em t+15d → recusa em t+29d, aceita em t+30d", async () => {
    const { wallet, setNow } = make();
    const t0 = at("2026-03-01T00:00:00.000Z").getTime();
    setNow(new Date(t0).toISOString());
    expect((await wallet.claimBiweekly("alice")).claimed).toBe(true);
    setNow(new Date(t0 + 15 * DAY).toISOString());
    expect((await wallet.claimBiweekly("alice")).claimed).toBe(true);
    setNow(new Date(t0 + 29 * DAY).toISOString());
    expect((await wallet.claimBiweekly("alice")).claimed).toBe(false);
    setNow(new Date(t0 + 30 * DAY).toISOString());
    expect((await wallet.claimBiweekly("alice")).claimed).toBe(true);
    expect(await credits(wallet, "alice")).toBe(3);
  });

  it("5 coletas quinzenais SIMULTÂNEAS → UMA concede (+1, não +5)", async () => {
    const { wallet, setNow } = make();
    setNow("2026-06-01T12:00:00.000Z");
    const r = await Promise.all(Array.from({ length: 5 }, () => wallet.claimBiweekly("alice")));
    expect(r.filter((x) => x.claimed)).toHaveLength(1);
    expect(await credits(wallet, "alice")).toBe(1);
  });

  it("virada de MÊS, de ANO e ano bissexto não quebram os 15 dias corridos", async () => {
    const cases: Array<[string, string, string]> = [
      // [1ª coleta, 14 dias depois (recusa), 15 dias depois (aceita)]
      ["2026-01-20T10:00:00.000Z", "2026-02-03T10:00:00.000Z", "2026-02-04T10:00:00.000Z"], // janeiro → fevereiro
      ["2026-12-25T10:00:00.000Z", "2027-01-08T10:00:00.000Z", "2027-01-09T10:00:00.000Z"], // virada de ano
      ["2028-02-20T10:00:00.000Z", "2028-03-05T10:00:00.000Z", "2028-03-06T10:00:00.000Z"], // bissexto: fevereiro tem 29 dias
      ["2026-02-20T10:00:00.000Z", "2026-03-06T10:00:00.000Z", "2026-03-07T10:00:00.000Z"], // não bissexto: fevereiro tem 28
    ];
    for (const [first, day14, day15] of cases) {
      expect(at(day14).getTime() - at(first).getTime(), first).toBe(14 * DAY); // a própria tabela está certa
      expect(at(day15).getTime() - at(first).getTime(), first).toBe(15 * DAY);
      const { wallet, setNow } = make();
      setNow(first);
      expect((await wallet.claimBiweekly("u")).claimed, `${first} 1ª`).toBe(true);
      setNow(day14);
      expect((await wallet.claimBiweekly("u")).claimed, `${first} +14d`).toBe(false);
      setNow(day15);
      expect((await wallet.claimBiweekly("u")).claimed, `${first} +15d`).toBe(true);
    }
  });

  it("a janela é o intervalo entre INSTANTES (não dia civil nem fuso): 23:59 de um dia + 15 dias exatos aceita, 1 minuto antes recusa", async () => {
    const { wallet, setNow } = make();
    const t0 = at("2026-06-01T23:59:00.000Z").getTime();
    setNow(new Date(t0).toISOString());
    expect((await wallet.claimBiweekly("alice")).claimed).toBe(true);
    setNow(new Date(t0 + 15 * DAY - 60_000).toISOString());
    expect((await wallet.claimBiweekly("alice")).claimed).toBe(false);
    setNow(new Date(t0 + 15 * DAY).toISOString());
    expect((await wallet.claimBiweekly("alice")).claimed).toBe(true);
  });

  it("FREE → 403 e nada é concedido (a checagem de tier é do controller; a carteira não é tocada)", async () => {
    const { wallet, setNow, repo } = make();
    setNow("2026-06-01T12:00:00.000Z");
    const specimens = new InMemorySpecimenRepository();
    const gb = new GeneBankService(specimens, new CrossService(specimens, wallet), wallet);
    const controller = (tier: Tier) => new GeneBankController(gb, wallet, { resolve: async () => tier } as unknown as TierService);

    await expect(controller("FREE").claimBiweekly({ id: "u-free", tier: "FREE" })).rejects.toBeInstanceOf(ForbiddenException);
    expect((await repo.get("u-free")).lastBiweekly ?? null).toBeNull();
    expect(await credits(wallet, "u-free")).toBe(0);

    // e JUNIOR (mesmo relógio simulado) concede, respeitando a janela
    expect((await controller("JUNIOR").claimBiweekly({ id: "u-jr", tier: "JUNIOR" })).claimed).toBe(true);
    setNow("2026-06-15T12:00:00.000Z"); // 14 dias
    expect((await controller("JUNIOR").claimBiweekly({ id: "u-jr", tier: "JUNIOR" })).claimed).toBe(false);
    setNow("2026-06-16T12:00:00.000Z"); // 15 dias
    expect((await controller("JUNIOR").claimBiweekly({ id: "u-jr", tier: "JUNIOR" })).claimed).toBe(true);
    expect(await credits(wallet, "u-jr")).toBe(2);
  });
});

describe("cota MENSAL de retratos extras — o mês vem do Clock (UTC)", () => {
  let savedFlag: string | undefined; let savedDb: string | undefined;
  beforeEach(() => {
    savedFlag = process.env.IMAGE_QUOTA_UNLIMITED; savedDb = process.env.DATABASE_URL;
    delete process.env.IMAGE_QUOTA_UNLIMITED; delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    if (savedFlag === undefined) delete process.env.IMAGE_QUOTA_UNLIMITED; else process.env.IMAGE_QUOTA_UNLIMITED = savedFlag;
    if (savedDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = savedDb;
  });
  const makeQuota = () => { const clock = new SystemClock(); return { clock, q: new ImageQuotaService(clock) }; };
  const exhaust = async (q: ImageQuotaService) => { for (let i = 0; i < 15; i++) expect(await q.tryConsume("u", "SENIOR")).toBe(true); };

  it("esgotou a cota no mês → recusa até o último instante do mês; no 1º instante do mês seguinte zera", async () => {
    const { clock, q } = makeQuota();
    clock.setForTesting(at("2026-06-10T12:00:00.000Z"));
    await exhaust(q);
    for (const t of ["2026-06-10T12:00:01.000Z", "2026-06-30T23:59:59.999Z"]) {
      clock.setForTesting(at(t));
      expect(await q.tryConsume("u", "SENIOR"), t).toBe(false);
    }
    clock.setForTesting(at("2026-07-01T00:00:00.000Z"));
    expect(await q.used("u")).toBe(0);
    expect(await q.tryConsume("u", "SENIOR")).toBe(true);
    expect(await q.used("u")).toBe(1);
  });

  it("virada de ANO e de fevereiro (28/29 dias) não quebram a conta", async () => {
    for (const [last, first] of [["2026-12-31T23:59:59.000Z", "2027-01-01T00:00:00.000Z"], ["2028-02-29T23:59:59.000Z", "2028-03-01T00:00:00.000Z"], ["2027-02-28T23:59:59.000Z", "2027-03-01T00:00:00.000Z"]] as const) {
      const { clock, q } = makeQuota();
      clock.setForTesting(at(last));
      await exhaust(q);
      expect(await q.tryConsume("u", "SENIOR"), last).toBe(false);
      clock.setForTesting(at(first));
      expect(await q.tryConsume("u", "SENIOR"), first).toBe(true);
    }
  });

  it("COMPORTAMENTO ATUAL (mês em UTC): a cota reinicia às 21:00 de São Paulo do último dia do mês", async () => {
    const { clock, q } = makeQuota();
    clock.setForTesting(at("2026-06-30T23:30:00.000Z")); // 20:30 BRT, 30/06
    await exhaust(q);
    expect(await q.tryConsume("u", "SENIOR")).toBe(false);
    clock.setForTesting(at("2026-07-01T00:30:00.000Z")); // 21:30 BRT — ainda 30/06 em São Paulo, já julho em UTC
    expect(await q.tryConsume("u", "SENIOR")).toBe(true);
  });

  it("produção inalterada: sem Clock injetado (`new ImageQuotaService()`) usa o relógio real", async () => {
    const q = new ImageQuotaService();
    expect(await q.tryConsume("u", "SENIOR")).toBe(true);
    expect(await q.used("u")).toBe(1);
  });
});
