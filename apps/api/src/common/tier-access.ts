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
 *
 * CORREÇÃO (pós-commit 7c89ca0, achado crítico verificado em produção):
 * híbridos são gravados como componentes unidos por "×" (combineSpecies,
 * cross.service.ts) — ex.: "panthera-uncia×panthera-tigris-albino" (8
 * espécimes reais). A versão original de `speciesMinRank` procurava esse
 * slug composto DIRETO em `SPECIES_INFO`, não achava, e caía no mínimo de
 * família (feline = FREE) — um híbrido selvagem ficava visível/cruzável no
 * FREE. Corrigido para resolver por COMPONENTE (ver `speciesMinRank`
 * abaixo) e fail-closed: componente desconhecido nunca resolve pra FREE.
 */
import { ForbiddenException } from "@nestjs/common";
import { SPECIES_INFO, type PoolGroup, type Tier } from "@genbreedai/shared";

type Family = "feline" | "canine" | "large";
const RANK: Record<Tier, number> = { FREE: 0, JUNIOR: 1, SENIOR: 2, PHD: 3 };
const FAMILY_MIN_TIER: Record<Family, number> = { feline: 0, canine: 2, large: 3 };
/** Tier mínimo por pool de espécie (ADR-0016). NÃO adicionar pool sem ADR. */
const POOL_GROUP_MIN_TIER: Record<PoolGroup, number> = { DOMESTIC_CAT: 0, WILD_FELINE: 1, DOG: 2 };

/**
 * Tier mínimo REAL pra uma espécie — FAIL-CLOSED (ADR-0016, correção pós-
 * commit 7c89ca0). `species` pode ser um slug simples ("panthera-onca") OU
 * um híbrido composto por "×" (combineSpecies) — ex.: "panthera-uncia×
 * panthera-tigris-albino", "felis-catus×leptailurus-serval". Cada componente
 * é resolvido SEPARADAMENTE:
 *   - poolGroup conhecido em `SPECIES_INFO` → `POOL_GROUP_MIN_TIER[poolGroup]`;
 *   - componente DESCONHECIDO (não cadastrado em `SPECIES_INFO`) → fail-closed:
 *     desconhecido NUNCA é FREE — resolve pra `max(mínimo de família, JUNIOR)`.
 * O resultado final é o MÁXIMO entre o mínimo de família e o maior mínimo
 * obtido entre os componentes — um híbrido só é FREE se TODOS os componentes
 * forem DOMESTIC_CAT.
 */
function speciesMinRank(family: string, species: string): number {
  const famMin = FAMILY_MIN_TIER[(family as Family)] ?? 3;
  const components = [...new Set(species.split("×"))];
  let maxComponentMin = 0;
  for (const c of components) {
    const pg = SPECIES_INFO[c]?.poolGroup;
    // Fail-closed: desconhecido nunca é FREE.
    const componentMin = pg ? POOL_GROUP_MIN_TIER[pg] : Math.max(famMin, RANK.JUNIOR);
    if (componentMin > maxComponentMin) maxComponentMin = componentMin;
  }
  return Math.max(famMin, maxComponentMin);
}

/**
 * O tier pode VER/usar este espécime como progenitor? (ADR-0016) — família E
 * pool de espécie (por componente, fail-closed) juntos. Espécimes fora do
 * pool devem ficar 404 (não 403): "escondidos", sem cadeado — ver
 * specimens.controller.ts e cross.service.ts.
 */
export function specimenVisibleAtTier(tier: Tier, pack: string, species: string): boolean {
  return RANK[tier] >= speciesMinRank(pack, species);
}

/**
 * Gate de FAMÍLIA (pack inteiro) + defesa em profundidade do gate
 * interespecífico (RESTAURADA — achado crítico pós-commit 7c89ca0: o pool de
 * espécie, checado em `resolve()` via `specimenVisibleAtTier`, cobre a
 * maioria dos casos, mas não é a ÚNICA barreira — este gate independente
 * garante que nenhum caminho de código futuro consiga expor um cruzamento
 * interespecífico ao tier FREE, mesmo que o pool falhe por algum motivo
 * (dado ausente, bug, chamada direta sem passar por `resolve()`).
 */
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

/** @deprecated (ADR-0016) use `specimenVisibleAtTier` — este só checa família, não pool de espécie. */
export function familyVisibleAtTier(tier: Tier, pack: string): boolean {
  const min = FAMILY_MIN_TIER[(pack as Family)] ?? 3;
  return RANK[tier] >= min;
}
