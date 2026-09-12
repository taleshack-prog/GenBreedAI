/**
 * Gate de acesso por tier (TDD §6). NÃO altera o motor (anti-P2W) — só decide se
 * o cruzamento é PERMITIDO para o tier: pool taxonômico + intra/interespecífico.
 *   FREE   : felinos base, APENAS intraespécie.
 *   JUNIOR : + híbridos interespecíficos de felinos.
 *   SENIOR : + caninos.
 *   PHD    : + grandes animais (bovino/equino/suíno/ovino).
 */
import { ForbiddenException } from "@nestjs/common";
import type { Tier } from "@genbreedai/shared";

type Family = "feline" | "canine" | "large";
const RANK: Record<Tier, number> = { FREE: 0, JUNIOR: 1, SENIOR: 2, PHD: 3 };
const FAMILY_MIN_TIER: Record<Family, number> = { feline: 0, canine: 2, large: 3 };

export function assertTierAllows(
  tier: Tier, sireFamily: string, damFamily: string, interspecific: boolean,
): void {
  const fams = [sireFamily, damFamily] as Family[];
  for (const f of fams) {
    const min = FAMILY_MIN_TIER[f] ?? 3;
    if (RANK[tier] < min) {
      const need = (Object.keys(RANK) as Tier[]).find((t) => RANK[t] === min);
      throw new ForbiddenException(`Espécie da família "${f}" exige o tier ${need} ou superior.`);
    }
  }
  // Interespecífico felino exige JUNIOR+ (FREE é intraespécie apenas).
  if (interspecific && RANK[tier] < RANK.JUNIOR) {
    throw new ForbiddenException("Cruzamento interespecífico exige tier JUNIOR ou superior (FREE é intraespécie apenas).");
  }
}

/** O tier pode VER espécimes desta família? (Free: só felinos; Senior: +caninos; PhD: +grandes) */
export function familyVisibleAtTier(tier: Tier, pack: string): boolean {
  const min = FAMILY_MIN_TIER[(pack as Family)] ?? 3;
  return RANK[tier] >= min;
}
