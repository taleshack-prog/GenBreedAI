/**
 * Regra de negócio dependente de tempo usa `Clock`, nunca a data do sistema (ADR-0029, regra 3 do CLAUDE.md), e o
 * jogo tem UM único "dia": o dia civil de SÃO PAULO (`America/Sao_Paulo`) — o mesmo da vaga de nascimento diária.
 *  - bônus DIÁRIO: dia civil de São Paulo (vira à MEIA-NOITE de Brasília, não às 21:00 como quando era UTC);
 *  - cota MENSAL de retratos extras: mês civil de São Paulo (vira à meia-noite do dia 1 de Brasília);
 *  - bônus QUINZENAL: janela de 15 dias entre INSTANTES — não depende de fuso (não mudou).
 * Tudo com relógio simulado (`SystemClock.setForTesting`, nunca fake timers). Horários "BRT" abaixo = Brasília
 * (UTC−3, sem horário de verão hoje); os testes de horário de verão usam datas de 2018-19, quando ele existia.
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
/** Horário de Brasília (UTC−3) → ISO UTC. Ex.: `br("2026-06-10T22:00")` = 2026-06-11T01:00:00.000Z. */
const br = (local: string) => new Date(`${local}:00-03:00`).toISOString();
/** Horário local com deslocamento explícito (ex.: `-02:00`, o horário de verão de 2018-19) → ISO UTC. */
const brAt = (local: string, offset: string) => new Date(`${local}:00${offset}`).toISOString();

function make() {
  const clock = new SystemClock();
  const repo = new InMemoryWalletRepository();
  const wallet = new WalletService(repo, clock);
  const setNow = (iso: string) => clock.setForTesting(at(iso));
  return { clock, repo, wallet, setNow };
}
const credits = async (w: WalletService, id: string) => (await w.get(id)).imageCredits ?? 0;

describe("bônus DIÁRIO — o dia é o dia civil de SÃO PAULO (vem do Clock)", () => {
  it("coleta às 20h de Brasília e outra às 22h do MESMO dia → a segunda é RECUSADA (22h BRT já é o dia seguinte em UTC, mas não em São Paulo)", async () => {
    const { wallet, setNow } = make();
    setNow(br("2026-06-10T20:00"));
    const a = await wallet.claimDaily("alice", "PHD");
    expect(a.claimed).toBe(true);
    expect(a.wallet.catalisadores).toBe(START.catalisadores + 600);
    setNow(br("2026-06-10T22:00")); // = 2026-06-11T01:00Z: outro dia em UTC, o mesmo dia em São Paulo
    const b = await wallet.claimDaily("alice", "PHD");
    expect(b.claimed).toBe(false);
    expect(b.wallet.catalisadores).toBe(a.wallet.catalisadores);
  });

  it("as 21h de Brasília NÃO viram o dia (era o bug: em UTC virava às 21h e dava dois bônus na mesma noite)", async () => {
    const { wallet, setNow } = make();
    setNow(br("2026-06-10T20:30"));
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
    for (const t of ["2026-06-10T21:00", "2026-06-10T21:30", "2026-06-10T23:30"]) {
      setNow(br(t));
      expect((await wallet.claimDaily("alice", "FREE")).claimed, t).toBe(false);
    }
    expect((await wallet.get("alice")).catalisadores).toBe(START.catalisadores + 80);
  });

  it("coleta às 23h59 e outra às 00h01 (meia-noite de Brasília) → a segunda é ACEITA; e dentro do novo dia recusa de novo", async () => {
    const { wallet, setNow } = make();
    setNow(br("2026-06-10T23:59"));
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
    setNow(br("2026-06-11T00:01"));
    const next = await wallet.claimDaily("alice", "FREE");
    expect(next.claimed).toBe(true);
    expect(next.wallet.catalisadores).toBe(START.catalisadores + 2 * 80);
    setNow(br("2026-06-11T10:00"));
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(false);
  });

  it("a virada é EXATAMENTE à meia-noite de Brasília: 23:59:59.999 recusa, 00:00:00.000 aceita", async () => {
    const { wallet, setNow } = make();
    setNow(br("2026-06-10T12:00"));
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
    setNow("2026-06-11T02:59:59.999Z"); // 23:59:59.999 em Brasília
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(false);
    setNow("2026-06-11T03:00:00.000Z"); // 00:00:00.000 em Brasília
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
  });

  it("duas (ou cinco) coletas SIMULTÂNEAS no mesmo dia → UMA só leva o bônus", async () => {
    const { wallet, setNow } = make();
    setNow(br("2026-06-10T12:00"));
    const r = await Promise.all(Array.from({ length: 5 }, () => wallet.claimDaily("alice", "SENIOR")));
    expect(r.filter((x) => x.claimed)).toHaveLength(1);
    expect((await wallet.get("alice")).catalisadores).toBe(START.catalisadores + 300);
  });

  it("vários dias seguidos: uma coleta por dia de São Paulo, sempre (inclusive coletando de noite, depois das 21h)", async () => {
    const { wallet, setNow } = make();
    let claims = 0;
    for (let d = 0; d < 10; d++) {
      for (const h of ["00:30", "13:00", "21:30", "23:50"]) {
        setNow(br(`2026-06-${String(10 + d).padStart(2, "0")}T${h}`));
        if ((await wallet.claimDaily("alice", "FREE")).claimed) claims++;
      }
    }
    expect(claims).toBe(10);
    expect((await wallet.get("alice")).catalisadores).toBe(START.catalisadores + 10 * 80);
  });

  it("virada de MÊS, de ANO e ano bissexto não quebram a conta", async () => {
    const { wallet, setNow } = make();
    const seq: Array<[string, boolean]> = [
      [br("2026-01-31T12:00"), true], [br("2026-01-31T23:59"), false],
      [br("2026-02-01T00:00"), true],                                    // fim de janeiro → fevereiro
      [br("2026-12-31T12:00"), true], [br("2026-12-31T23:59"), false],
      [br("2027-01-01T00:00"), true],                                    // virada de ano
      [br("2028-02-28T12:00"), true], [br("2028-02-29T00:00"), true],    // 29/02 existe (bissexto)
      [br("2028-02-29T18:00"), false], [br("2028-03-01T00:00"), true],
    ];
    for (const [t, expected] of seq) {
      setNow(t);
      expect((await wallet.claimDaily("alice", "FREE")).claimed, t).toBe(expected);
    }
  });

  it("HORÁRIO DE VERÃO (se voltar): o dia segue a meia-noite LOCAL — em 2018-12 (UTC−2) 23:30 e 00:30 são dias diferentes; 00:30 e 10:00 são o mesmo", async () => {
    const { wallet, setNow } = make();
    setNow(brAt("2018-12-15T23:30", "-02:00")); // = 2018-12-16T01:30Z
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
    setNow(brAt("2018-12-16T00:30", "-02:00")); // = 2018-12-16T02:30Z — com "-03:00" fixo ainda seria dia 15 e seria recusado
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
    setNow(brAt("2018-12-16T10:00", "-02:00"));
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(false);
  });

  it("produção inalterada no que importa: sem Clock injetado (`new WalletService(repo)`) usa o relógio real", async () => {
    const wallet = new WalletService(new InMemoryWalletRepository());
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(true);
    expect((await wallet.claimDaily("alice", "FREE")).claimed).toBe(false);
  });
});

describe("bônus QUINZENAL — janela móvel de 15 dias do Clock (não depende de fuso; NÃO mudou)", () => {
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

  it("a janela é o intervalo entre INSTANTES (não dia civil nem fuso): 15 dias exatos aceita, 1 minuto antes recusa — mesmo atravessando a meia-noite de Brasília", async () => {
    const { wallet, setNow } = make();
    const t0 = at(br("2026-06-01T23:59")).getTime(); // 1 minuto antes da meia-noite de Brasília
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

describe("cota MENSAL de retratos extras — o mês é o mês civil de SÃO PAULO (vem do Clock)", () => {
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

  it("a cota reinicia à MEIA-NOITE do dia 1 de Brasília — não às 21h do último dia do mês", async () => {
    const { clock, q } = makeQuota();
    clock.setForTesting(at(br("2026-06-10T12:00")));
    await exhaust(q);
    // 21h30 do último dia (= 00:30Z de 1º de julho): em UTC já era julho; em São Paulo AINDA é junho → continua recusando
    for (const t of ["2026-06-30T20:59", "2026-06-30T21:30", "2026-06-30T23:59"]) {
      clock.setForTesting(at(br(t)));
      expect(await q.tryConsume("u", "SENIOR"), t).toBe(false);
    }
    clock.setForTesting(at("2026-07-01T02:59:59.999Z")); // 23:59:59.999 do dia 30 em Brasília
    expect(await q.tryConsume("u", "SENIOR")).toBe(false);
    clock.setForTesting(at("2026-07-01T03:00:00.000Z")); // 00:00:00.000 do dia 1 em Brasília
    expect(await q.used("u")).toBe(0);
    expect(await q.tryConsume("u", "SENIOR")).toBe(true);
    expect(await q.used("u")).toBe(1);
  });

  it("virada de ANO e de fevereiro (28/29 dias) não quebram a conta", async () => {
    for (const [last, first] of [
      [br("2026-12-31T23:59"), br("2027-01-01T00:00")],
      [br("2028-02-29T23:59"), br("2028-03-01T00:00")],
      [br("2027-02-28T23:59"), br("2027-03-01T00:00")],
    ] as const) {
      const { clock, q } = makeQuota();
      clock.setForTesting(at(last));
      await exhaust(q);
      expect(await q.tryConsume("u", "SENIOR"), last).toBe(false);
      clock.setForTesting(at(first));
      expect(await q.tryConsume("u", "SENIOR"), first).toBe(true);
    }
  });

  it("horário de verão (se voltar): o mês vira à meia-noite LOCAL — em 2018-12-31 23:30 (UTC−2) ainda é dezembro, 2019-01-01 00:30 já é janeiro", async () => {
    const { clock, q } = makeQuota();
    clock.setForTesting(at(brAt("2018-12-31T23:30", "-02:00"))); // = 2019-01-01T01:30Z: já janeiro em UTC, ainda dezembro em São Paulo
    await exhaust(q);
    expect(await q.tryConsume("u", "SENIOR")).toBe(false);
    clock.setForTesting(at(brAt("2019-01-01T00:30", "-02:00")));
    expect(await q.tryConsume("u", "SENIOR")).toBe(true);
  });

  it("produção inalterada no que importa: sem Clock injetado (`new ImageQuotaService()`) usa o relógio real", async () => {
    const q = new ImageQuotaService();
    expect(await q.tryConsume("u", "SENIOR")).toBe(true);
    expect(await q.used("u")).toBe(1);
  });
});
