/**
 * Orquestrador de cruzamento (TDD §4.4).
 *
 * cross() é a única porta de entrada estocástica do motor. É DETERMINÍSTICA sob
 * (genótipos + método + seed) e TIER-AGNÓSTICA: não recebe tier de usuário —
 * essa é a garantia estrutural anti-P2W (TDD §0). Nenhuma probabilidade muda
 * por assinatura; tiers afetam apenas cotas/ferramentas fora do motor.
 */

import {
  CURRENT_ART_VERSION,
  type BreedingMethod,
  type CrossResult,
  type Genotype,
} from "@genbreedai/shared";
import type { Pedigree, SpeciesPack } from "./types";
import { createPrng } from "./rng";
import { generateGamete, combineGametes } from "./gamete";
import { expressPhenotype } from "./phenotype";
import { wrightF } from "./wright";
import { fertilityScore } from "./fertility";
import { fixationIndex, mapFixationToAura } from "./fixation";
import { sha256 } from "./sha256";
import { punnettLocus } from "./punnett";

export interface ParentInput {
  /** Id do indivíduo no pedigree (para F de Wright). */
  id: string;
  genotype: Genotype;
  generation: number;
}

export interface CrossContext {
  pack: SpeciesPack;
  /** Pedigree contendo pai, mãe e ancestrais comuns (para F_pedigree). */
  pedigree: Pedigree;
  /** True quando os progenitores são de espécies distintas (Haldane em F1). */
  interspecific?: boolean;
  /** Loci que o jogador tenta fixar (para o IF). Default: todos os loci. */
  targetLoci?: string[];
  /** Gerações sob seleção direcionada (para o IF). Default: geração da prole. */
  generationsUnderSelection?: number;
  /** Sobrescreve µ de mutação (uso em testes). Default: por-loco do pack. */
  mutationRateOverride?: number;
}

/** Validação de restrições de cruzamento (TDD §4.4, passo 1). */
export function validateBreedingConstraints(
  parentA: ParentInput,
  parentB: ParentInput,
  pack: SpeciesPack,
): void {
  const packLoci = new Set(Object.keys(pack.loci));
  for (const p of [parentA, parentB]) {
    for (const locus of Object.keys(p.genotype.loci)) {
      if (!packLoci.has(locus)) {
        throw new Error(
          `Loco "${locus}" do espécime ${p.id} não pertence ao pack ${pack.slug}.`,
        );
      }
    }
  }
}

/** Gera o genótipo canônico em string (ordenado) para hash de cache/proveniência. */
export function hashGenotype(genotype: Genotype): string {
  const loci = Object.keys(genotype.loci)
    .sort()
    .map((k) => {
      const [a, b] = genotype.loci[k]!;
      const pair = [a, b].sort();
      return `${k}:${pair[0]}/${pair[1]}`;
    })
    .join(",");
  const qtl = Object.keys(genotype.qtl)
    .sort()
    .map((k) => `${k}=${genotype.qtl[k]!.toFixed(6)}`)
    .join(",");
  return `loci{${loci}}|qtl{${qtl}}`;
}

/** Finaliza um zigoto: fenótipo, F, fertilidade, IF, aura, cacheKey. */
function finalizeSpecimen(
  zygote: Genotype, parentA: ParentInput, parentB: ParentInput,
  method: BreedingMethod, ctx: CrossContext, rng: ReturnType<typeof createPrng>,
): CrossResult {
  const phenotype = expressPhenotype(zygote, ctx.pack);
  const fPedigree = wrightF(ctx.pedigree, parentA.id, parentB.id);
  const fertility = fertilityScore(method, fPedigree, { interspecific: ctx.interspecific ?? false, rng });
  const generation = Math.max(parentA.generation, parentB.generation) + 1;
  const targetLoci = ctx.targetLoci ?? Object.keys(zygote.loci);
  const generationsUnderSelection = ctx.generationsUnderSelection ?? generation;
  const fixation = fixationIndex({ genotype: zygote, targetLoci, fPedigree, generationsUnderSelection });
  const aura = mapFixationToAura(fixation.index);
  const cacheKey = sha256(hashGenotype(zygote) + "|" + ctx.pack.id + "|" + CURRENT_ART_VERSION);
  return {
    specimen: { genotype: zygote, phenotype, fPedigree: Number(fPedigree.toFixed(6)), fertility, fixationIndex: fixation.index, aura, generation, method },
    cacheKey,
  };
}

/**
 * Cruzamento com SORTEIO (tier grátis/Junior): gera 1 filhote ponderado pela
 * probabilidade mendeliana real, sob seed determinística. É a via anti-P2W base.
 */

// ── Genética QUANTITATIVA (poligênica) — ADR-0012 ──
// Herdabilidade h² por traço (0..1). Traços não listados usam 0.5.
const HERITABILITY: Record<string, number> = {
  porte: 0.55, vigor: 0.5, beleza: 0.4, temperamento: 0.4, rosetas: 0.5,
};
const SEG_SIGMA = 0.12; // desvio-base da segregação (variância "realista/moderada")

/** Gaussiana N(0,1) determinística via Box-Muller usando o PRNG. */
function gauss(rng: { next(): number }): number {
  let u = 0, v = 0;
  while (u === 0) u = rng.next();
  while (v === 0) v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * QTL poligênico: o filho recebe a MÉDIA parental + desvio de segregação
 * gaussiano (muitos micro-loci → distribuição ~normal). σ escala com √h².
 * Determinístico sob o rng. Reproduz "irmãos variam em torno da média".
 */
function segregateQtl(
  a: Record<string, number>, b: Record<string, number>, rng: { next(): number },
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const mid = ((a[k] ?? 0) + (b[k] ?? 0)) / 2;
    const h2 = HERITABILITY[k] ?? 0.5;
    out[k] = clamp01(mid + gauss(rng) * SEG_SIGMA * Math.sqrt(h2));
  }
  return out;
}

export function cross(
  parentA: ParentInput, parentB: ParentInput, method: BreedingMethod, seed: string, ctx: CrossContext,
): CrossResult {
  validateBreedingConstraints(parentA, parentB, ctx.pack);
  const rng = createPrng(seed);
  const gameteA = generateGamete(parentA.genotype, rng, ctx.pack, ctx.mutationRateOverride);
  const gameteB = generateGamete(parentB.genotype, rng, ctx.pack, ctx.mutationRateOverride);
  const zygote = combineGametes(gameteA, gameteB);
  // QTL poligênico: substitui a média-exata por amostra de segregação (determinística).
  zygote.qtl = segregateQtl(parentA.genotype.qtl, parentB.genotype.qtl, rng);
  return finalizeSpecimen(zygote, parentA, parentB, method, ctx, rng);
}

/** Uma opção de prole enumerada (para seleção fenotípica em tiers pagos). */
export interface OffspringOption {
  genotype: Genotype;
  prob: number;
  phenotype: import("@genbreedai/shared").Phenotype;
  fixationIndex: number;
  aura: number;
  /** Chave estável do genótipo (para materializar a escolha). */
  key: string;
  /** Quantos genótipos distintos produzem ESTE mesmo fenótipo (portadores). */
  variants: number;
}

/**
 * Enumera as combinações genotípicas possíveis da prole, com PROBABILIDADES
 * REAIS (idênticas em todos os tiers — anti-P2W). QTL = ponto-médio parental.
 * Retorna as `topN` mais prováveis, com fenótipo/IF/aura por opção.
 */
export function enumerateOffspring(
  parentA: ParentInput, parentB: ParentInput, ctx: CrossContext, topN = 6,
): OffspringOption[] {
  validateBreedingConstraints(parentA, parentB, ctx.pack);
  const loci = Object.keys(parentA.genotype.loci).filter((l) => parentB.genotype.loci[l]);
  let combos: Array<{ loci: Record<string, [string, string]>; prob: number }> = [{ loci: {}, prob: 1 }];
  for (const locus of loci) {
    const dist = [...punnettLocus(parentA.genotype.loci[locus]!, parentB.genotype.loci[locus]!).entries()];
    const next: typeof combos = [];
    for (const cur of combos) for (const [key, p] of dist) {
      const [x, y] = key.split("/");
      next.push({ loci: { ...cur.loci, [locus]: [x!, y!] }, prob: cur.prob * p });
    }
    combos = next.sort((a, b) => b.prob - a.prob).slice(0, Math.max(topN * 4, 24));
  }
  // Base para amostrar o QTL de cada opção (determinístico por par de pais + opção).
  const qtlBase = `${parentA.id}x${parentB.id}`;

  const fPedigree = wrightF(ctx.pedigree, parentA.id, parentB.id);
  const generation = Math.max(parentA.generation, parentB.generation) + 1;
  const gens = ctx.generationsUnderSelection ?? generation;

  // Agrupa por FENÓTIPO (genótipos que produzem a mesma aparência somam probabilidade;
  // diferem só em portadores ocultos). O jogador seleciona o FENÓTIPO, não o portador.
  const groups = new Map<string, { rep: { loci: Record<string, [string, string]>; prob: number }; phenKey: string; prob: number; variants: number; phenotype: ReturnType<typeof expressPhenotype> }>();
  for (const c of combos) {
    const genotype: Genotype = { loci: c.loci, qtl: {} };
    const phenotype = expressPhenotype(genotype, ctx.pack);
    const phenKey = JSON.stringify(Object.entries(phenotype.loci).sort());
    const g = groups.get(phenKey);
    if (g) { g.prob += c.prob; g.variants += 1; if (c.prob > g.rep.prob) g.rep = c; }
    else groups.set(phenKey, { rep: c, phenKey, prob: c.prob, variants: 1, phenotype });
  }
  return [...groups.values()].sort((a, b) => b.prob - a.prob).slice(0, topN).map((g) => {
    const optRng = createPrng(`${qtlBase}|${g.phenKey}`);
    const qtl = segregateQtl(parentA.genotype.qtl, parentB.genotype.qtl, optRng);
    const genotype: Genotype = { loci: g.rep.loci, qtl };
    const targetLoci = ctx.targetLoci ?? Object.keys(genotype.loci);
    const fixation = fixationIndex({ genotype, targetLoci, fPedigree, generationsUnderSelection: gens });
    return {
      genotype, prob: g.prob, phenotype: g.phenotype,
      fixationIndex: fixation.index, aura: mapFixationToAura(fixation.index),
      key: hashGenotype(genotype), variants: g.variants,
    };
  });
}

/**
 * Materializa uma opção ESCOLHIDA (tier Senior/PhD). O genótipo já foi decidido
 * pelo jogador entre as opções enumeradas; determinístico. Não altera
 * probabilidades — apenas concretiza a seleção artificial (TDD personas/§6).
 */
export function materializeCross(
  parentA: ParentInput, parentB: ParentInput, method: BreedingMethod, seed: string,
  ctx: CrossContext, chosenGenotype: Genotype,
): CrossResult {
  validateBreedingConstraints(parentA, parentB, ctx.pack);
  const rng = createPrng(seed);
  return finalizeSpecimen(chosenGenotype, parentA, parentB, method, ctx, rng);
}
