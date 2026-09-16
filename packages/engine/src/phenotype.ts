/**
 * Resolução fenotípica (TDD §4.1 / §4.4, passo 4).
 *
 * Ordem de resolução:
 *   1. Letalidade (ex.: M/M duplo-merle) → viable = false.
 *   2. Dominância por loco (COMPLETE / INCOMPLETE / CODOMINANT).
 *   3. Epistasia (ex.: Harlequin H sobre Merle M).
 */

import type { Genotype, Phenotype, Sex } from "@genbreedai/shared";
import type { LocusDef, PigmentOverrideRule, SpeciesPack } from "./types";
import { baseAllele, isMutant } from "./gamete";

/** Chave de heterozigoto normalizada, ex.: ("F","f") → "F|f" pela ordem do rank. */
function heteroKey(def: LocusDef, a: string, b: string): string {
  const ra = def.dominanceRank.indexOf(a);
  const rb = def.dominanceRank.indexOf(b);
  const [hi, lo] = ra <= rb ? [a, b] : [b, a];
  return `${hi}|${lo}`;
}

/** Resolve o descritor de UM loco isolado (sem epistasia). */
function expressLocus(def: LocusDef, rawA: string, rawB: string): string {
  const a = baseAllele(rawA);
  const b = baseAllele(rawB);

  if (a === b) {
    return def.phenotypeByAllele[a] ?? a;
  }

  if (def.dominance === "COMPLETE") {
    // O alelo de menor índice no rank domina.
    const ra = def.dominanceRank.indexOf(a);
    const rb = def.dominanceRank.indexOf(b);
    const dominant = ra <= rb ? a : b;
    return def.phenotypeByAllele[dominant] ?? dominant;
  }

  // INCOMPLETE ou CODOMINANT: heterozigoto tem descritor próprio.
  const key = heteroKey(def, a, b);
  const hetero = def.heteroPhenotype?.[key];
  if (hetero) return hetero;

  // Fallback conservador: codominância "a+b".
  return `${def.phenotypeByAllele[a] ?? a}+${def.phenotypeByAllele[b] ?? b}`;
}

/**
 * Resolve o descritor de UM loco LIGADO AO X (ADR-0013) — 1 alelo (macho
 * hemizigoto) ou 2 (fêmea). Fêmea heterozigota NÃO é dominância clássica: é
 * MOSAICO por inativação do X — o pack declara o rótulo via
 * `heteroPhenotype`, mesma convenção usada pra INCOMPLETE/CODOMINANT acima.
 */
function expressXLocus(def: LocusDef, alleles: readonly string[]): string {
  if (alleles.length === 1) {
    const a = baseAllele(alleles[0]!);
    return def.phenotypeByAllele[a] ?? a;
  }
  const [rawA, rawB] = alleles as [string, string];
  const a = baseAllele(rawA);
  const b = baseAllele(rawB);
  if (a === b) return def.phenotypeByAllele[a] ?? a;
  const key = heteroKey(def, a, b);
  const hetero = def.heteroPhenotype?.[key];
  if (hetero) return hetero;
  return `${def.phenotypeByAllele[a] ?? a}+${def.phenotypeByAllele[b] ?? b}`;
}

/**
 * Resolve a regra `pigmentOverride` (ADR-0013) a partir do loco ligado ao X.
 * Retorna `null` quando o zigoto não tem dado nesse loco (genótipo legado —
 * NUNCA um erro, só "regra não se aplica").
 */
function resolvePigmentOverride(
  rule: PigmentOverrideRule,
  zygote: Genotype,
  pack: SpeciesPack,
  loci: Record<string, string>,
): { coatPigment: "EUMELANIN" | "PHEOMELANIN" | "MOSAIC"; pigmentDiluted: boolean; ghostPattern: boolean } | null {
  const rawX = zygote.xLoci?.[rule.xLocus];
  if (!rawX) return null;
  const alleles = rawX.map(baseAllele);

  let coatPigment: "EUMELANIN" | "PHEOMELANIN" | "MOSAIC";
  if (alleles.length === 1) {
    coatPigment = alleles[0] === rule.activeAllele ? "PHEOMELANIN" : "EUMELANIN";
  } else {
    const bothActive = alleles.every((a) => a === rule.activeAllele);
    const noneActive = alleles.every((a) => a !== rule.activeAllele);
    coatPigment = bothActive ? "PHEOMELANIN" : noneActive ? "EUMELANIN" : "MOSAIC";
  }

  let pigmentDiluted = false;
  if (rule.dilutionLocus && rule.dilutedAllele) {
    const pair = zygote.loci[rule.dilutionLocus];
    if (pair) pigmentDiluted = baseAllele(pair[0]) === rule.dilutedAllele && baseAllele(pair[1]) === rule.dilutedAllele;
  }

  let ghostPattern = false;
  if (coatPigment === "PHEOMELANIN" && rule.patternLocus && rule.uniformPatternAllele) {
    const pDef = pack.loci[rule.patternLocus];
    const uniformLabel = pDef?.phenotypeByAllele[rule.uniformPatternAllele];
    ghostPattern = uniformLabel !== undefined && loci[rule.patternLocus] === uniformLabel;
  }

  return { coatPigment, pigmentDiluted, ghostPattern };
}

/**
 * Expressa o fenótipo completo de um zigoto sob um data pack.
 *
 * `sex` (ADR-0017, OPCIONAL): sexo do zigoto, só usado pra resolver loci
 * LIMITADOS AO SEXO (`LocusDef.sexExpression`). Ausente = nenhuma
 * limitação por sexo é aplicada (comportamento IDÊNTICO ao de antes desta
 * ADR — todos os 4 golden tests continuam chamando sem o 3º argumento).
 */
export function expressPhenotype(
  zygote: Genotype,
  pack: SpeciesPack,
  sex?: Sex,
): Phenotype {
  // 1. Letalidade — qualquer combo letal inviabiliza o embrião.
  let viable = true;
  for (const lethal of pack.lethals) {
    const pair = zygote.loci[lethal.locus];
    if (!pair) continue;
    const [x, y] = [baseAllele(pair[0]), baseAllele(pair[1])];
    const [lx, ly] = lethal.genotype;
    const match =
      (x === lx && y === ly) || (x === ly && y === lx);
    if (match) viable = false;
  }

  // 2. Dominância por loco (autossômico).
  const loci: Record<string, string> = {};
  for (const [locusName, pair] of Object.entries(zygote.loci)) {
    const def = pack.loci[locusName];
    if (!def) {
      loci[locusName] = `${pair[0]}/${pair[1]}`;
      continue;
    }
    loci[locusName] = expressLocus(def, pair[0], pair[1]);
    // Loci LIMITADOS AO SEXO (ADR-0017) — expressos só no sexo indicado; no
    // OUTRO sexo, o fenótipo sai sempre como o do alelo MAIS RECESSIVO de
    // `dominanceRank` (o "estado desligado"), INDEPENDENTE do genótipo real —
    // o indivíduo continua PORTANDO e TRANSMITINDO o(s) alelo(s) normalmente,
    // só não EXPRESSA. Ex.: Ma (juba) SEX_LIMITED_M no pack felino — fêmea
    // Ma/Ma nunca tem juba, mas transmite Ma aos filhos macho (ver testes).
    // SEX_INFLUENCED não é implementado aqui (fora de escopo desta ADR).
    if (sex !== undefined && def.sexExpression) {
      const suppressed =
        (def.sexExpression === "SEX_LIMITED_M" && sex === "F") ||
        (def.sexExpression === "SEX_LIMITED_F" && sex === "M");
      if (suppressed) {
        const offAllele = def.dominanceRank[def.dominanceRank.length - 1]!;
        loci[locusName] = def.phenotypeByAllele[offAllele] ?? offAllele;
      }
    }
  }

  // 2b. Loci ligados ao X (ADR-0013) — hemizigoto (macho) ou mosaico (fêmea
  // heterozigota). Ausente em genótipos legados/packs sem xLoci: sem efeito.
  for (const [locusName, alleles] of Object.entries(zygote.xLoci ?? {})) {
    const def = pack.xLoci[locusName];
    if (!def) {
      loci[locusName] = alleles.map(baseAllele).join("/");
      continue;
    }
    loci[locusName] = expressXLocus(def, alleles);
  }

  // 3. Epistasia — sobrescreve o alvo quando o modificador está presente.
  const epistasis: string[] = [];
  for (const rule of pack.epistasis) {
    const modPair = zygote.loci[rule.modifierLocus];
    const tgtPair = zygote.loci[rule.targetLocus];
    if (!modPair || !tgtPair) continue;

    const modHas = modPair
      .map(baseAllele)
      .includes(rule.whenAllelePresent);
    const tgtHas =
      rule.targetWhenAllelePresent === undefined
        ? true
        : tgtPair.map(baseAllele).includes(rule.targetWhenAllelePresent);

    if (modHas && tgtHas) {
      loci[rule.targetLocus] = rule.override;
      epistasis.push(rule.label);
    }
  }

  // 4. Interações tipadas (ADR-0013) — hoje só pigmentOverride. Formato
  // PRÓPRIO, não reaproveita nem altera as regras de epistasia acima.
  let coatPigment: Phenotype["coatPigment"];
  let pigmentDiluted: boolean | undefined;
  let ghostPattern: boolean | undefined;
  for (const rule of pack.interactionRules ?? []) {
    if (rule.kind === "pigmentOverride") {
      const resolved = resolvePigmentOverride(rule, zygote, pack, loci);
      if (resolved) {
        coatPigment = resolved.coatPigment;
        pigmentDiluted = resolved.pigmentDiluted;
        ghostPattern = resolved.ghostPattern;
      }
    }
  }

  // Mutação: presente se qualquer alelo do zigoto (autossômico ou ligado ao X) carrega o rótulo indelével.
  const hasMutation =
    Object.values(zygote.loci).some((pair) => pair.some(isMutant)) ||
    Object.values(zygote.xLoci ?? {}).some((alleles) => alleles.some(isMutant));

  return { loci, qtl: { ...zygote.qtl }, viable, epistasis, hasMutation, coatPigment, pigmentDiluted, ghostPattern };
}
