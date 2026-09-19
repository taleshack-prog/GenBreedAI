/**
 * O ÚNICO "dia" do jogo: o dia civil de São Paulo (ADR-0029, fuso único) — `common/sao-paulo-time.ts`.
 * Base compartilhada do bônus diário, da cota mensal de retratos e da vaga de nascimento diária. Não usa
 * deslocamento fixo: acerta o horário de verão (o Brasil não adota desde 2019, mas adotou em 2018-19 e pode voltar) e os
 * dias de 23/25 horas. Os casos de horário de verão usam datas REAIS de 2018-19 (o banco de fusos do runtime as conhece)
 * e, como contraprova, a America/New_York (que tem horário de verão hoje).
 */
import { describe, it, expect } from "vitest";
import {
  civilDateIn, civilMonthIn, startOfCivilDayIn, startOfNextCivilDayIn,
  saoPauloDate, saoPauloMonth, startOfSaoPauloDay, startOfNextSaoPauloDay, GAME_TIME_ZONE,
} from "../src/common/sao-paulo-time";
import { startOfSaoPauloDay as startOfSaoPauloDayFromQuota } from "../src/quota/quota.service";

const z = (iso: string) => new Date(iso);
const iso = (d: Date) => d.toISOString();
const NY = "America/New_York";

describe("dia e mês civis de São Paulo", () => {
  it("o fuso do jogo é America/Sao_Paulo", () => {
    expect(GAME_TIME_ZONE).toBe("America/Sao_Paulo");
  });

  it("o dia vira à MEIA-NOITE de Brasília (03:00Z), não às 21:00 (00:00Z)", () => {
    expect(saoPauloDate(z("2026-06-10T02:59:59.999Z"))).toBe("2026-06-09"); // 23:59:59.999 em Brasília
    expect(saoPauloDate(z("2026-06-10T03:00:00.000Z"))).toBe("2026-06-10"); // 00:00:00.000
    expect(saoPauloDate(z("2026-06-10T00:30:00.000Z"))).toBe("2026-06-09"); // 21:30 do dia 9: em UTC já era dia 10, em São Paulo não
    expect(saoPauloDate(z("2026-06-10T23:59:59.999Z"))).toBe("2026-06-10"); // 20:59 do dia 10
  });

  it("o mês vira à meia-noite do dia 1 de Brasília", () => {
    expect(saoPauloMonth(z("2026-07-01T02:59:59.999Z"))).toBe("2026-06");
    expect(saoPauloMonth(z("2026-07-01T03:00:00.000Z"))).toBe("2026-07");
    expect(saoPauloMonth(z("2026-07-01T00:30:00.000Z"))).toBe("2026-06"); // 21:30 do dia 30 — em UTC já era julho
    expect(civilMonthIn(z("2027-01-01T02:59:59.000Z"), GAME_TIME_ZONE)).toBe("2026-12");
    expect(civilMonthIn(z("2027-01-01T03:00:00.000Z"), GAME_TIME_ZONE)).toBe("2027-01");
  });

  it("virada de ano e ano bissexto", () => {
    expect(saoPauloDate(z("2026-01-01T02:59:59Z"))).toBe("2025-12-31");
    expect(saoPauloDate(z("2028-02-29T15:00:00Z"))).toBe("2028-02-29"); // 29/02 existe
    expect(saoPauloDate(z("2028-03-01T02:59:59Z"))).toBe("2028-02-29");
    expect(saoPauloDate(z("2027-03-01T02:59:59Z"))).toBe("2027-02-28"); // 2027 não é bissexto
  });
});

describe("início do dia civil — sem horário de verão (hoje) é a meia-noite de Brasília, UTC−3", () => {
  it("é `AAAA-MM-DDT03:00:00.000Z` (igual ao cálculo antigo com -03:00 fixo)", () => {
    for (const t of ["2026-06-10T15:20:11.123Z", "2026-06-10T03:00:00.000Z", "2026-06-11T02:59:59.999Z", "2026-01-01T00:00:00.000Z", "2028-02-29T23:59:59.999Z"]) {
      const day = saoPauloDate(z(t));
      expect(iso(startOfSaoPauloDay(z(t))), t).toBe(new Date(`${day}T00:00:00-03:00`).toISOString());
    }
  });

  it("um milissegundo antes do início ainda é o dia anterior", () => {
    const start = startOfSaoPauloDay(z("2026-06-10T15:00:00Z"));
    expect(iso(start)).toBe("2026-06-10T03:00:00.000Z");
    expect(saoPauloDate(new Date(start.getTime() - 1))).toBe("2026-06-09");
    expect(iso(startOfSaoPauloDay(new Date(start.getTime() - 1)))).toBe("2026-06-09T03:00:00.000Z");
  });

  it("o início do dia SEGUINTE é 24 h depois (dia normal)", () => {
    expect(iso(startOfNextSaoPauloDay(z("2026-06-10T15:00:00Z")))).toBe("2026-06-11T03:00:00.000Z");
    expect(iso(startOfNextSaoPauloDay(z("2028-02-29T15:00:00Z")))).toBe("2028-03-01T03:00:00.000Z");
    expect(iso(startOfNextSaoPauloDay(z("2026-12-31T15:00:00Z")))).toBe("2027-01-01T03:00:00.000Z");
  });

  it("a função que a vaga de nascimento já usava (`quota.service`) é a MESMA daqui (reaproveitada, não reescrita)", () => {
    expect(startOfSaoPauloDayFromQuota).toBe(startOfSaoPauloDay);
  });
});

describe("HORÁRIO DE VERÃO — a função não pode quebrar se ele voltar", () => {
  it("São Paulo em 2018-12 (UTC−2): 00:30 do dia 16 já é dia 16 — com -03:00 fixo daria 15", () => {
    expect(saoPauloDate(z("2018-12-16T02:30:00Z"))).toBe("2018-12-16"); // 00:30 (UTC−2)
    expect(saoPauloDate(z("2018-12-16T01:30:00Z"))).toBe("2018-12-15"); // 23:30 do dia 15
    expect(iso(startOfSaoPauloDay(z("2018-12-16T02:30:00Z")))).toBe("2018-12-16T02:00:00.000Z"); // meia-noite local = 02:00Z
    expect(iso(startOfNextSaoPauloDay(z("2018-12-16T12:00:00Z")))).toBe("2018-12-17T02:00:00.000Z");
  });

  it("virada PARA o horário de verão (2018-11-04, 00:00 → 01:00): a meia-noite NÃO EXISTE; o dia começa à 01:00 local e dura 23 h", () => {
    expect(saoPauloDate(z("2018-11-04T02:59:59.999Z"))).toBe("2018-11-03");
    expect(saoPauloDate(z("2018-11-04T03:00:00.000Z"))).toBe("2018-11-04"); // 01:00 (UTC−2)
    expect(iso(startOfSaoPauloDay(z("2018-11-04T12:00:00Z")))).toBe("2018-11-04T03:00:00.000Z");
    const next = startOfNextSaoPauloDay(z("2018-11-04T12:00:00Z"));
    expect(iso(next)).toBe("2018-11-05T02:00:00.000Z");
    expect((next.getTime() - z("2018-11-04T03:00:00Z").getTime()) / 3600000).toBe(23);
  });

  it("virada DE VOLTA ao horário normal (2019-02-17, 00:00 → 23:00): o dia 16 dura 25 h, e o 17 só começa às 03:00Z", () => {
    expect(iso(startOfSaoPauloDay(z("2019-02-16T12:00:00Z")))).toBe("2019-02-16T02:00:00.000Z");
    expect(iso(startOfSaoPauloDay(z("2019-02-17T02:30:00Z")))).toBe("2019-02-16T02:00:00.000Z"); // 23:30 (UTC−3) — ainda dia 16
    const next = startOfNextSaoPauloDay(z("2019-02-16T12:00:00Z"));
    expect(iso(next)).toBe("2019-02-17T03:00:00.000Z");
    expect((next.getTime() - z("2019-02-16T02:00:00Z").getTime()) / 3600000).toBe(25);
    expect(iso(startOfSaoPauloDay(z("2019-02-17T05:00:00Z")))).toBe("2019-02-17T03:00:00.000Z");
  });

  it("a mesma lógica acerta um fuso que TEM horário de verão hoje (America/New_York): dias de 23 h e de 25 h", () => {
    expect(iso(startOfCivilDayIn(z("2026-03-08T12:00:00Z"), NY))).toBe("2026-03-08T05:00:00.000Z"); // EST (UTC−5)
    expect(iso(startOfNextCivilDayIn(z("2026-03-08T12:00:00Z"), NY))).toBe("2026-03-09T04:00:00.000Z"); // EDT (UTC−4): dia de 23 h
    expect(iso(startOfCivilDayIn(z("2026-11-01T12:00:00Z"), NY))).toBe("2026-11-01T04:00:00.000Z"); // EDT
    expect(iso(startOfNextCivilDayIn(z("2026-11-01T12:00:00Z"), NY))).toBe("2026-11-02T05:00:00.000Z"); // EST: dia de 25 h
    expect(civilDateIn(z("2026-11-02T04:59:59Z"), NY)).toBe("2026-11-01");
  });

  it("a data civil NUNCA volta no tempo e o início do dia fecha a conta, varrendo as viradas de 2018-19 e de Nova York", () => {
    const sweeps: Array<[string, string, string]> = [
      ["2018-11-03T00:00:00Z", "2018-11-06T00:00:00Z", GAME_TIME_ZONE],
      ["2019-02-15T00:00:00Z", "2019-02-19T00:00:00Z", GAME_TIME_ZONE],
      ["2026-03-07T00:00:00Z", "2026-03-10T00:00:00Z", NY],
      ["2026-10-31T00:00:00Z", "2026-11-03T00:00:00Z", NY],
    ];
    for (const [from, to, tz] of sweeps) {
      let prev = "";
      for (let t = z(from).getTime(); t < z(to).getTime(); t += 15 * 60_000) {
        const now = new Date(t);
        const date = civilDateIn(now, tz);
        expect(date >= prev, `${tz} ${now.toISOString()}`).toBe(true);
        prev = date;
        const start = startOfCivilDayIn(now, tz);
        const next = startOfNextCivilDayIn(now, tz);
        expect(start.getTime() <= t && t < next.getTime(), `${tz} ${now.toISOString()} dentro do dia`).toBe(true);
        expect(civilDateIn(start, tz)).toBe(date);                          // o início é do MESMO dia…
        expect(civilDateIn(new Date(start.getTime() - 60_000), tz) < date).toBe(true); // …e 1 minuto antes é o dia anterior
        expect(civilDateIn(next, tz) > date).toBe(true);                    // e o seguinte já é outro dia
      }
    }
  });

  it("amostragem determinística de 600 instantes entre 2015 e 2030 (cobre a era do horário de verão): o início do dia sempre é do mesmo dia e 1 min antes é o anterior", () => {
    let seed = 20260919;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const lo = z("2015-01-01T00:00:00Z").getTime(); const span = z("2030-12-31T00:00:00Z").getTime() - lo;
    for (let i = 0; i < 600; i++) {
      const now = new Date(lo + Math.floor(rnd() * span));
      const date = saoPauloDate(now);
      const start = startOfSaoPauloDay(now);
      expect(start.getTime() <= now.getTime(), now.toISOString()).toBe(true);
      expect(saoPauloDate(start), now.toISOString()).toBe(date);
      expect(saoPauloDate(new Date(start.getTime() - 60_000)) < date, now.toISOString()).toBe(true);
    }
  });
});
