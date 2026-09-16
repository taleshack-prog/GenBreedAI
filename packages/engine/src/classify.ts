/**
 * Classificador DETERMINÍSTICO do tipo de cruzamento (a "IA auxiliar" do
 * Laboratório). A partir dos dois pais + pedigree, deduz o método mais provável
 * usando parentesco (F de Wright), gerações e espécies — sem LLM, preciso e grátis.
 *
 * Regras (ordem de prioridade):
 *  - Espécies/linhagens diferentes, sem parentesco → F1 (híbrido interespecífico).
 *  - Um dos pais é ancestral direto do outro (retrocruza para a linha) → BC1.
 *  - Pais são irmãos completos (mesmos pais) → F2 (irmãos F1) ou INBREED (endogamia).
 *  - Parentesco alto (F ≥ 0.25) → INBREED.
 *  - Parentesco brando com ancestral-alvo recorrente → LINE (linebreeding).
 *  - Mesma espécie, sem parentesco ENTRE os pais, mas pelo menos um pai já
 *    vem de linha com endogamia própria (F_pedigree > 0) e o filhote reduziria
 *    esse F → OUTCROSS ("sangue novo" pra resgatar a linha).
 *  - Mesma espécie, sem parentesco e SEM endogamia em nenhum dos pais (ex.:
 *    dois fundadores) → F1 (não há linha nenhuma pra "resgatar").
 *  - Fallback por geração (ambos F1 → F2; ambos F2 → F3).
 */
import type { BreedingMethod } from "@genbreedai/shared";
import type { Pedigree } from "./types";
import { kinship } from "./wright";

export interface ClassifyInput {
  sireId: string;
  damId: string;
  sireSpecies: string;
  damSpecies: string;
  sireGeneration: number;
  damGeneration: number;
  /** F_pedigree PRÓPRIO de cada pai (não o do filhote) — decide OUTCROSS vs F1 quando não há parentesco ENTRE os pais (regra 7). */
  sireFPedigree: number;
  damFPedigree: number;
  pedigree: Pedigree;
}

export interface CrossClassification {
  method: BreedingMethod;
  /** Coeficiente de parentesco f(sire,dam) (0..1). */
  kinship: number;
  /** Explicação curta em pt-BR para exibir ao breeder. */
  reason: string;
  /** true se há risco de depressão endogâmica (F alto). */
  inbreedingRisk: boolean;
}

/** Um id é ancestral do outro no pedigree? */
function isAncestor(ped: Pedigree, ancestorId: string, ofId: string, depth = 0): boolean {
  if (depth > 20) return false;
  const node = ped[ofId];
  if (!node) return false;
  if (node.sire === ancestorId || node.dam === ancestorId) return true;
  return (
    (node.sire ? isAncestor(ped, ancestorId, node.sire, depth + 1) : false) ||
    (node.dam ? isAncestor(ped, ancestorId, node.dam, depth + 1) : false)
  );
}

/** Compartilham os MESMOS pais (irmãos completos)? */
function fullSiblings(ped: Pedigree, a: string, b: string): boolean {
  const na = ped[a], nb = ped[b];
  if (!na || !nb || !na.sire || !na.dam || !nb.sire || !nb.dam) return false;
  const setA = [na.sire, na.dam].sort().join("|");
  const setB = [nb.sire, nb.dam].sort().join("|");
  return setA === setB;
}

export function classifyCross(input: ClassifyInput): CrossClassification {
  const { sireId, damId, sireSpecies, damSpecies, sireGeneration, damGeneration, sireFPedigree, damFPedigree, pedigree } = input;
  const f = kinship(pedigree, sireId, damId);
  const inbreedingRisk = f >= 0.125;

  // 1) Espécies/linhagens diferentes e sem parentesco → F1 (híbrido).
  if (sireSpecies !== damSpecies && f < 0.01) {
    return { method: "F1", kinship: f, inbreedingRisk: false,
      reason: "Pais de linhagens diferentes e sem parentesco: cruzamento inicial (F1)." };
  }

  // 2) Um é ancestral direto do outro → retrocruzamento (BC1).
  if (isAncestor(pedigree, sireId, damId) || isAncestor(pedigree, damId, sireId)) {
    return { method: "BC1", kinship: f, inbreedingRisk,
      reason: "Um dos pais é ancestral do outro: retrocruzamento (backcross) para fixar a linha." };
  }

  // 3) Irmãos completos (F1×F1 etc.) → F2/F3 pela geração. Carrega risco (f≈0.25).
  if (fullSiblings(pedigree, sireId, damId)) {
    const gen = Math.max(sireGeneration, damGeneration);
    const method: BreedingMethod = gen >= 2 ? "F3" : "F2";
    return { method, kinship: f, inbreedingRisk: true,
      reason: `Cruzamento entre irmãos da mesma ninhada: geração ${method} (endogamia leve, F=${f.toFixed(3)}).` };
  }

  // 4) Parentesco muito alto (mais próximo que irmãos) → endogamia.
  if (f > 0.25) {
    return { method: "INBREED", kinship: f, inbreedingRisk: true,
      reason: `Pais fortemente aparentados (F=${f.toFixed(3)}): endogamia (inbreeding).` };
  }

  // 5) Parentesco brando → linebreeding.
  if (f >= 0.0625) {
    return { method: "LINE", kinship: f, inbreedingRisk,
      reason: `Parentesco moderado (F=${f.toFixed(3)}): linhagem controlada (linebreeding).` };
  }

  // 6) Mesma espécie, parentesco baixo mas não nulo → segue a geração.
  if (f > 0.01) {
    const gen = Math.max(sireGeneration, damGeneration);
    const method: BreedingMethod = gen >= 2 ? "F3" : "F2";
    return { method, kinship: f, inbreedingRisk,
      reason: `Descendentes aparentados distantes: geração ${method}.` };
  }

  // 7) Mesma espécie, sem parentesco ENTRE os pais. Só é "outcross de resgate"
  // se pelo menos um pai já vem de linha com endogamia PRÓPRIA (F_pedigree >
  // 0) e o filhote (F=f, ~0 nesta branch) reduz esse F. Dois fundadores sem
  // parentesco (F_pedigree=0 nos dois) não estão "resgatando" linha nenhuma —
  // é o primeiro cruzamento: F1.
  if (sireSpecies === damSpecies) {
    const maxParentF = Math.max(sireFPedigree, damFPedigree);
    if (maxParentF > 0 && f < maxParentF) {
      return { method: "OUTCROSS", kinship: f, inbreedingRisk: false,
        reason: `Sangue novo numa linha com endogamia (pai/mãe com F=${maxParentF.toFixed(3)}): outcross reduz o F do filhote.` };
    }
    return { method: "F1", kinship: f, inbreedingRisk: false,
      reason: "Mesma espécie, pais sem parentesco nem endogamia própria: primeiro cruzamento (F1)." };
  }

  // 8) Fallback.
  return { method: "F1", kinship: f, inbreedingRisk: false,
    reason: "Cruzamento inicial (F1)." };
}
