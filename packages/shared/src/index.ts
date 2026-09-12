/**
 * @genbreedai/shared — Tipos, DTOs e constantes compartilhadas.
 *
 * Contratos derivados do TDD (Seção 3 — Modelo de Dados). Nenhum tipo aqui
 * inventa entidades fora do TDD. Identificadores em inglês; comentários em pt-BR.
 */

// ─── Enums de domínio (TDD §3) ────────────────────────────────────────────────

export type Tier = "FREE" | "JUNIOR" | "SENIOR" | "PHD";

export type Archetype =
  | "FELINO"
  | "CANINO"
  | "BOVINO"
  | "EQUINO"
  | "SUINO"
  | "OVINO";

export type Dominance = "COMPLETE" | "INCOMPLETE" | "CODOMINANT";

export type TraitType = "DISCRETE" | "QUANTITATIVE";

/**
 * Métodos de acasalamento (TDD §3 / §4). F1..F3 são geracionais; BC1 retrocruzamento;
 * LINE line-breeding; INBREED endocruzamento estrito; OUTCROSS resgate exogâmico.
 */
export type BreedingMethod =
  | "F1"
  | "F2"
  | "F3"
  | "BC1"
  | "LINE"
  | "INBREED"
  | "OUTCROSS";

// ─── Genoma (TDD §3.1) ────────────────────────────────────────────────────────

/** Um alelo é um rótulo textual, ex.: "b", "K^br", "M", "a^t". */
export type Allele = string;

/** Par diploide de alelos em um loco. */
export type LocusPair = [Allele, Allele];

/** Genótipo: pares alélicos por loco + vetor de QTLs contínuos em [0,1]. */
export interface Genotype {
  loci: Record<string, LocusPair>;
  qtl: Record<string, number>;
}

// ─── Auras (TDD §4.3) ─────────────────────────────────────────────────────────

export type Aura = 1 | 2 | 3 | 4 | 5;

// ─── Resultado de cruzamento (contrato do motor, TDD §4.4) ────────────────────

export interface Phenotype {
  /** Descritor expresso por loco após dominância/epistasia. */
  loci: Record<string, string>;
  /** QTLs expressos (herdados do genótipo). */
  qtl: Record<string, number>;
  /** Falso quando uma combinação letal inviabiliza o embrião (ex.: M/M). */
  viable: boolean;
  /** Rótulos epistáticos aplicados (ex.: "harlequin"). */
  epistasis: string[];
  /** True se algum alelo mutante ("mutação") está presente. */
  hasMutation: boolean;
}

export interface FertilityResult {
  /** Fertilidade em pontos [0,100]. */
  score: number;
  /** Probabilidade de óbito embrionário não-reversível [0,1] (TDD §4.2). */
  inviabilityRisk: number;
  /** True quando a Regra de Haldane esteriliza o sexo heterogamético (F1 interespecífico). */
  haldaneSterile: boolean;
  /** Trilha de auditoria dos modificadores aplicados. */
  notes: string[];
}

export interface FixationResult {
  /** Índice de Fixação composto (métrica de jogo, TDD §4.3). */
  index: number;
  hTarget: number;
  gPedigree: number;
  sGenerations: number;
}

export interface CrossResultSpecimen {
  genotype: Genotype;
  phenotype: Phenotype;
  fPedigree: number;
  fertility: FertilityResult;
  fixationIndex: number;
  aura: Aura;
  generation: number;
  method: BreedingMethod;
}

export interface CrossResult {
  specimen: CrossResultSpecimen;
  /** SHA-256(genotypeHash + speciesPack + artVersion) — TDD §5.1. */
  cacheKey: string;
}

// ─── Constantes globais (TDD §4.2 / §5.1) ─────────────────────────────────────

/** Taxa de mutação espontânea: 1e-4 por loco por gameta (TDD §4.2). */
export const DEFAULT_MUTATION_RATE = 1e-4 as const;

/** Rótulo indelével de alelo mutante (TDD §4.2). */
export const MUTATION_TAG = "mutação" as const;

/** Versão do pipeline de arte usada na chave de cache (TDD §5.1). */
export const CURRENT_ART_VERSION = "art-v2" as const;

export { SPECIES_INFO, speciesInfo, biologicalSpecies, type SpeciesInfo } from "./species";
export { BREEDS, breedInfo, DOG_BREEDS, dogBreedInfo, type BreedInfo } from "./breeds";
