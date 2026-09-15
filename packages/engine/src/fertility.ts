/**
 * Dinâmica de fertilidade e viabilidade (TDD §4.2; Haldane por sexo — ADR-0015).
 *
 * Base por método:
 *   - Intraespécie (F1 intra, LINE, INBREED, OUTCROSS): 100
 *   - F1 interespecífico (Regra de Haldane, condicionada ao SEXO do zigoto e
 *     à `hybridClass` do PAR DE PAIS — ADR-0015, corrige TDD §4.2 "sexo
 *     heterogamético", que o código anterior zerava pros dois sexos):
 *       macho (heterogamético, XY)               → 0, haldaneStatus STERILE
 *       fêmea, hybridClass DOCUMENTED_FERTILE_FEMALE → 50–80, REDUCED
 *       fêmea, hybridClass UNDOCUMENTED              → 5–15, REDUCED
 *   - BC1: 60–80   ·   F2: 30–50
 * Modificadores:
 *   - F_pedigree > 0.15 → −10% da base por 0.05 adicional (depressão endogâmica)
 *   - F_pedigree > 0.25 → risco de óbito embrionário ≥ 5%
 *   - OUTCROSS → bônus de heterose de +40% a +60%
 *
 * Determinismo: valores dentro de faixas são resolvidos por PRNG semeado.
 */

import type { BreedingMethod, FertilityResult, Sex } from "@genbreedai/shared";
import type { HybridClass } from "./types";
import type { Rng } from "./rng";

export interface FertilityOptions {
  /** Sexo do ZIGOTO sendo avaliado (ADR-0015) — decide o ramo de Haldane em F1 interespecífico. */
  sex: Sex;
  /**
   * Classe de hibridação do PAR DE PAIS (ADR-0015) — `hybridClass(parentA,
   * parentB, pack)`, SEMPRE derivada da espécie real dos pais, nunca do
   * `method`. SAME_SPECIES nunca aciona Haldane (base 100, igual intraespécie).
   */
  hybridClass: HybridClass;
  /** PRNG determinístico para resolver faixas (BC1/F2/outcross/Haldane-fêmea). */
  rng: Rng;
}

/** Resolve um valor determinístico dentro de [min, max] usando o PRNG. */
function withinRange(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

export function fertilityScore(
  method: BreedingMethod,
  fPedigree: number,
  opts: FertilityOptions,
): FertilityResult {
  const notes: string[] = [];
  let base: number;
  let haldaneStatus: "NONE" | "STERILE" | "REDUCED" = "NONE";

  switch (method) {
    case "F1":
      if (opts.hybridClass === "SAME_SPECIES") {
        base = 100;
        notes.push("Cruzamento intraespécie basal: fertilidade 100.");
      } else if (opts.sex === "M") {
        // Sexo heterogamético (XY, felinos/caninos) — Regra de Haldane: F1
        // interespecífico macho é estéril, INDEPENDENTE da hybridClass (ADR-0015).
        base = 0;
        haldaneStatus = "STERILE";
        notes.push(
          `Regra de Haldane: macho (sexo heterogamético) estéril em F1 interespecífico (classe ${opts.hybridClass}).`,
        );
      } else if (opts.hybridClass === "DOCUMENTED_FERTILE_FEMALE") {
        base = withinRange(opts.rng, 50, 80);
        haldaneStatus = "REDUCED";
        notes.push(
          "Regra de Haldane: fêmea (sexo homogamético) em F1 interespecífico documentado (par com hibridação real conhecida) — fertilidade reduzida 50–80.",
        );
      } else {
        base = withinRange(opts.rng, 5, 15);
        haldaneStatus = "REDUCED";
        notes.push(
          "Regra de Haldane: fêmea (sexo homogamético) em F1 interespecífico SEM documentação de hibridação — fertilidade reduzida conservadora 5–15 (GRADE muito baixo, ver ADR-0015).",
        );
      }
      break;
    case "BC1":
      base = withinRange(opts.rng, 60, 80);
      notes.push("BC1 (retrocruzamento): fertilidade 60–80.");
      break;
    case "F2":
      base = withinRange(opts.rng, 30, 50);
      notes.push("F2 (intercruzamento): fertilidade 30–50.");
      break;
    case "OUTCROSS": {
      base = 100;
      const bonus = withinRange(opts.rng, 0.4, 0.6);
      base = Math.min(100, base * (1 + bonus)); // heterose sobre base, teto 100
      notes.push(`Outcross de resgate: +${(bonus * 100).toFixed(0)}% de heterose.`);
      break;
    }
    case "F3":
    case "LINE":
    case "INBREED":
    default:
      base = 100;
      notes.push("Base intraespécie: 100 (antes de modificadores de endogamia).");
      break;
  }

  // Depressão endogâmica (F > 0.15): −10% da base por 0.05 adicional.
  let score = base;
  if (fPedigree > 0.15) {
    const steps = (fPedigree - 0.15) / 0.05;
    const penalty = steps * 0.1;
    score = Math.max(0, base * (1 - penalty));
    notes.push(
      `Depressão endogâmica: F=${fPedigree.toFixed(3)} → penalidade ${(penalty * 100).toFixed(1)}%.`,
    );
  }

  // Inviabilidade embrionária (F > 0.25): risco ≥ 5%.
  let inviabilityRisk = 0;
  if (fPedigree > 0.25) {
    // 5% no limiar, crescendo 5% adicional por 0.05 acima de 0.25 (conservador).
    const extra = ((fPedigree - 0.25) / 0.05) * 0.05;
    inviabilityRisk = Math.min(1, 0.05 + extra);
    notes.push(
      `Inviabilidade embrionária: F=${fPedigree.toFixed(3)} → risco ${(inviabilityRisk * 100).toFixed(1)}%.`,
    );
  }

  return {
    score: Number(score.toFixed(4)),
    inviabilityRisk: Number(inviabilityRisk.toFixed(4)),
    haldaneStatus,
    // @deprecated (ADR-0015) — derivado, ver JSDoc do campo em @genbreedai/shared.
    haldaneSterile: haldaneStatus === "STERILE",
    notes,
  };
}
