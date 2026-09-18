/**
 * Tempo de gestação por aura (ADR-0021) — mesma tabela EXATA da API
 * (`apps/api/src/incubator/gestation-time.ts`), duplicada aqui porque a web
 * precisa mostrar "Gestação: Xh" ANTES de gestar: o card recém-cruzado no
 * Laboratório só tem `aura` (`IncubatorDescription`, devolvido por
 * `POST /cross`) — `gestationHours` só existe depois de listado/gestado
 * (`IncubatorEntry`, calculado pela API). Nunca inventar um valor fora desta
 * tabela (CLAUDE.md §2 regra 1) — mudar aqui sem mudar junto a API (ou
 * vice-versa) já seria uma divergência entre o que a web promete e o que a
 * API cobra.
 */
export const GESTATION_HOURS_BY_AURA: Readonly<Record<number, number>> = {
  1: 12,
  2: 18,
  3: 24,
  4: 36,
  5: 48,
};

export function gestationHoursForAura(aura: number): number {
  const hours = GESTATION_HOURS_BY_AURA[aura];
  if (hours === undefined) {
    throw new Error(`aura fora da faixa 1-5 suportada pela tabela de gestação (ADR-0021): ${aura}`);
  }
  return hours;
}

/**
 * "11h 32min restantes" / "45min restantes" / "Pronto para nascer!" — usado
 * no card GESTANDO/pronto da Incubadora. `now` é parâmetro (não `new Date()`
 * interno) pra ficar testável sem esperar tempo real.
 */
export function gestationRemainingLabel(gestationEndsAt: string, now: Date = new Date()): string {
  const diffMs = new Date(gestationEndsAt).getTime() - now.getTime();
  if (diffMs <= 0) return "Pronto para nascer!";
  const totalMin = Math.ceil(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}min restantes`;
  return `${h}h ${m}min restantes`;
}

/** `true` quando o prazo de gestação já passou (pronta pra nascer), mesmo o servidor ainda não tendo processado o `/born`. */
export function isGestationReady(gestationEndsAt: string, now: Date = new Date()): boolean {
  return new Date(gestationEndsAt).getTime() <= now.getTime();
}
