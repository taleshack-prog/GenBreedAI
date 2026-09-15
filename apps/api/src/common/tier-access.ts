/**
 * Gate de acesso por tier (TDD §6). NÃO altera o motor (anti-P2W) — só decide se
 * o cruzamento é PERMITIDO para o tier: pool de espécie (ADR-0016) + família.
 *   FREE   : Felis catus (DOMESTIC_CAT) apenas.
 *   JUNIOR : + felinos selvagens (WILD_FELINE) — inclusive intraespécie
 *            (ex.: tigre-de-bengala × tigre-branco exige JUNIOR mesmo sendo
 *            a mesma biologicalSpecies — não é sobre interespecificidade,
 *            é sobre a ESPÉCIE em si estar fora do pool grátis).
 *   SENIOR : + caninos (DOG).
 *   PHD    : + grandes animais (bovino/equino/suíno/ovino — sem poolGroup
 *            cadastrado ainda, gate só por família).
 */
import { ForbiddenException } from "@nestjs/common";
import { SPECIES_INFO, type PoolGroup, type Tier } from "@genbreedai/shared";

type Family = "feline" | "canine" | "large";
const RANK: Record<Tier, number> = { FREE: 0, JUNIOR: 1, SENIOR: 2, PHD: 3 };
const FAMILY_MIN_TIER: Record<Family, number> = { feline: 0, canine: 2, large: 3 };
/** Tier mínimo por pool de espécie (ADR-0016). NÃO adicionar pool sem ADR. */
const POOL_GROUP_MIN_TIER: Record<PoolGroup, number> = { DOMESTIC_CAT: 0, WILD_FELINE: 1, DOG: 2 };

/**
 * Tier mínimo REAL pra uma espécie: o maior entre o mínimo da família (como
 * sempre) e o mínimo do poolGroup dela, se cadastrado (ADR-0016). Sem
 * poolGroup cadastrado (a maioria das raças caninas, que só existem em
 * DOG_BREEDS, não em SPECIES_INFO) → cai pro mínimo de família, sem inventar
 * restrição extra — nunca mais restritivo que o comportamento de sempre.
 */
function speciesMinRank(family: string, species: string): number {
  const famMin = FAMILY_MIN_TIER[(family as Family)] ?? 3;
  const pg = SPECIES_INFO[species]?.poolGroup;
  if (!pg) return famMin;
  return Math.max(famMin, POOL_GROUP_MIN_TIER[pg]);
}

/**
 * O tier pode VER/usar este espécime como progenitor? (ADR-0016) — família E
 * pool de espécie juntos. Espécimes fora do pool devem ficar 404 (não 403):
 * "escondidos", sem cadeado — ver specimens.controller.ts e cross.service.ts.
 */
export function specimenVisibleAtTier(tier: Tier, pack: string, species: string): boolean {
  return RANK[tier] >= speciesMinRank(pack, species);
}

/**
 * Gate de FAMÍLIA (pack inteiro) — inalterado desde antes da ADR-0016. O gate
 * por ESPÉCIE/pool (mais fino, cobre o caso "mesma espécie mas fora do pool
 * grátis") é `specimenVisibleAtTier`, aplicado a cada specimen individualmente
 * como 404 — ver cross.service.ts (`resolve()`) e specimens.controller.ts.
 * Mantido com o mesmo nome/assinatura de antes (sem o param `interspecific`,
 * que a ADR-0016 tornou redundante — pool de espécie já cobre esse caso e
 * mais).
 */
export function assertTierAllows(tier: Tier, sireFamily: string, damFamily: string): void {
  const fams = [sireFamily, damFamily] as Family[];
  for (const f of fams) {
    const min = FAMILY_MIN_TIER[f] ?? 3;
    if (RANK[tier] < min) {
      const need = (Object.keys(RANK) as Tier[]).find((t) => RANK[t] === min);
      throw new ForbiddenException(`Espécie da família "${f}" exige o tier ${need} ou superior.`);
    }
  }
}

/** @deprecated (ADR-0016) use `specimenVisibleAtTier` — este só checa família, não pool de espécie. */
export function familyVisibleAtTier(tier: Tier, pack: string): boolean {
  const min = FAMILY_MIN_TIER[(pack as Family)] ?? 3;
  return RANK[tier] >= min;
}
