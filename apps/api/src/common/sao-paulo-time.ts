/**
 * O ÚNICO "dia" do jogo: o dia civil de São Paulo (`America/Sao_Paulo`) — ADR-0029 (fuso único).
 *
 * Vale para a vaga de nascimento diária de SENIOR/PHD (`QuotaService`), para o bônus DIÁRIO e para o mês da cota
 * mensal de retratos extras. Antes o bônus diário e a cota mensal usavam UTC e viravam às 21:00 de Brasília, enquanto
 * a vaga de nascimento já usava o dia de São Paulo — dois bônus numa mesma noite e um "dia" diferente por regra.
 * O bônus quinzenal NÃO usa isto: é um intervalo entre INSTANTES e não depende de fuso.
 *
 * Tudo aqui parte do banco de fusos do runtime (`Intl`), nunca de um deslocamento fixo: o Brasil não adota horário
 * de verão desde 2019, mas já adotou (e pode voltar) — com `-03:00` fixo o "dia" errava por 1 hora durante o horário
 * de verão. Estas funções também acertam os dias de 23 e de 25 horas das viradas de horário. `now` sempre vem de
 * `Clock` (regra de negócio dependente de tempo nunca lê a data do sistema — ADR-0029).
 */

/** Fuso do jogo. */
export const GAME_TIME_ZONE = "America/Sao_Paulo";

const MINUTE_MS = 60_000;
/** Um dia civil tem no máximo ~25 h (virada de horário de verão): olhar 26 h para trás sempre sai do dia. */
const LOOKBACK_MS = 26 * 60 * MINUTE_MS;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Data civil (`AAAA-MM-DD`) de `now` no fuso `timeZone` — a virada do dia é à meia-noite LOCAL, com horário de verão se houver. */
export function civilDateIn(now: Date, timeZone: string): string {
  let y = ""; let m = ""; let d = "";
  for (const p of formatter(timeZone).formatToParts(now)) {
    if (p.type === "year") y = p.value;
    else if (p.type === "month") m = p.value;
    else if (p.type === "day") d = p.value;
  }
  return `${y.padStart(4, "0")}-${m}-${d}`;
}

/** Mês civil (`AAAA-MM`) de `now` no fuso `timeZone` — vira à meia-noite local do dia 1. */
export function civilMonthIn(now: Date, timeZone: string): string {
  return civilDateIn(now, timeZone).slice(0, 7);
}

/**
 * Primeiro instante do dia civil de `now` no fuso `timeZone`. Busca o MENOR instante (em minutos inteiros) cuja data
 * civil já é a de `now`: a data civil nunca volta no tempo, então a busca binária vale para qualquer fuso — inclusive
 * dias de 23/25 horas e dias em que a meia-noite não existe (o relógio pula de 00:00 para 01:00: o dia começa à 01:00).
 */
export function startOfCivilDayIn(now: Date, timeZone: string): Date {
  const ymd = civilDateIn(now, timeZone);
  let hi = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS; // já é do dia `ymd` (o início do dia é minuto inteiro)
  let lo = hi - LOOKBACK_MS;                                   // ainda é do dia anterior
  while (hi - lo > MINUTE_MS) {
    const mid = lo + Math.floor((hi - lo) / MINUTE_MS / 2) * MINUTE_MS;
    if (civilDateIn(new Date(mid), timeZone) >= ymd) hi = mid; else lo = mid;
  }
  return new Date(hi);
}

/** Primeiro instante do dia civil SEGUINTE ao de `now` (não é "início + 24 h": o dia pode ter 23 ou 25 horas). */
export function startOfNextCivilDayIn(now: Date, timeZone: string): Date {
  // início + 26 h cai sempre dentro do dia seguinte (o dia tem 23-25 h e o seguinte, no mínimo 23 h).
  return startOfCivilDayIn(new Date(startOfCivilDayIn(now, timeZone).getTime() + LOOKBACK_MS), timeZone);
}

/** Dia civil de São Paulo (`AAAA-MM-DD`) — o "dia" do bônus diário e da vaga de nascimento. */
export function saoPauloDate(now: Date): string { return civilDateIn(now, GAME_TIME_ZONE); }

/** Mês civil de São Paulo (`AAAA-MM`) — o "mês" da cota mensal de retratos extras; vira à meia-noite do dia 1 de Brasília. */
export function saoPauloMonth(now: Date): string { return civilMonthIn(now, GAME_TIME_ZONE); }

/** Meia-noite (início) do dia civil de São Paulo, como instante UTC. */
export function startOfSaoPauloDay(now: Date): Date { return startOfCivilDayIn(now, GAME_TIME_ZONE); }

/** Meia-noite do dia civil de São Paulo SEGUINTE, como instante UTC. */
export function startOfNextSaoPauloDay(now: Date): Date { return startOfNextCivilDayIn(now, GAME_TIME_ZONE); }
