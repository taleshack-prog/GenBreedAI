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

/** Sexo cromossômico (ADR-0013). XY = macho, XX = fêmea. Aneuploidias fora de escopo. */
export type Sex = "M" | "F";

/**
 * Alelo(s) de UM loco ligado ao X num indivíduo: 1 elemento = macho
 * (hemizigoto, um X só); 2 elementos = fêmea (XX). Nunca 0 nem >2 (ADR-0013).
 */
export type XLocusAlleles = [Allele] | [Allele, Allele];

/**
 * Genótipo: pares alélicos autossômicos por loco + vetor de QTLs contínuos em
 * [0,1]. `xLoci` é OPCIONAL — ausente = sem dado (packs sem loci ligados ao X,
 * ex. canino; ou genótipos legados anteriores à ADR-0013, tratados como "sem
 * override" pelo motor, nunca como erro).
 */
export interface Genotype {
  loci: Record<string, LocusPair>;
  qtl: Record<string, number>;
  xLoci?: Record<string, XLocusAlleles>;
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
  /**
   * Via de pigmento resultante de uma regra `pigmentOverride` (ADR-0013),
   * ex.: locus O ligado ao X felino. Ausente em packs/indivíduos sem essa
   * regra ou sem dado em `xLoci` — nunca um valor "adivinhado".
   */
  coatPigment?: "EUMELANIN" | "PHEOMELANIN" | "MOSAIC";
  /** True quando o loco de diluição autossômico (ex.: D=d/d) dilui o pigmento acima. */
  pigmentDiluted?: boolean;
  /** True quando PHEOMELANIN + padrão "uniforme" — listras/rosetas residuais fracas. */
  ghostPattern?: boolean;
  /**
   * Porte na maturidade, com efeito materno (ADR-0014 — Walton & Hammond
   * 1938). Alimenta prompt/IF/classificador/papel de mãe na próxima geração.
   * Ausente quando o pack não declara `maternalEffect.porte`.
   */
  porteAdulto?: number;
  /** Porte ao nascer, com efeito materno — só exibição, não alimenta nada além disso. */
  porteNascimento?: number;
}

export interface FertilityResult {
  /** Fertilidade em pontos [0,100]. */
  score: number;
  /** Probabilidade de óbito embrionário não-reversível [0,1] (TDD §4.2). */
  inviabilityRisk: number;
  /**
   * Estado da Regra de Haldane (ADR-0015) para ESTE indivíduo, em F1
   * interespecífico (SAME_SPECIES nunca aciona):
   *   NONE    — não é F1 interespecífico (intraespécie, ou método != F1).
   *   STERILE — sexo heterogamético (macho) em F1 interespecífico: score=0.
   *   REDUCED — fêmea em F1 interespecífico: score numa faixa reduzida,
   *             dependente de `DOCUMENTED_FERTILE_FEMALE`/`UNDOCUMENTED`
   *             (ver hybridClass()/fertility.ts).
   */
  haldaneStatus: "NONE" | "STERILE" | "REDUCED";
  /**
   * @deprecated (ADR-0015) derivado de `haldaneStatus === "STERILE"`.
   * Mantido porque apps/web (lib/api.ts) e apps/api (cross.service.spec.ts)
   * ainda leem este campo — não removido nesta etapa (Etapa 5-API decide).
   * Note bem: `false` aqui NÃO significa "fértil plena" — uma fêmea F1
   * interespecífico com `haldaneStatus === "REDUCED"` também tem
   * `haldaneSterile === false`, mesmo com fertilidade bem abaixo de 100.
   */
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
  /** Sexo cromossômico do zigoto (ADR-0013) — sorteado pelo RNG da seed, nunca opcional. */
  sex: Sex;
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

export { SPECIES_INFO, speciesInfo, biologicalSpecies, normalizeBiologicalSpecies, type SpeciesInfo, type PoolGroup } from "./species";
export { BREEDS, breedInfo, DOG_BREEDS, dogBreedInfo, type BreedInfo } from "./breeds";
export { cap, phenoSummary } from "./phenotype-summary";
export { WILD_FELINE_FOUNDER_NAMES, wildFelineFounderName, baseFounderId, resolveDisplayName, resolveScientificName, revealTitleWord } from "./display";
