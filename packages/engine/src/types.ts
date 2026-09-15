/**
 * Tipos internos do motor genético. Descrevem *como* um data pack define seus
 * loci — dominância, hierarquia alélica, epistasia e combinações letais.
 *
 * Regra anti-alucinação (TDD §0): loci, alelos e regras vêm SEMPRE de um
 * SpeciesPack documentado (ver src/data/*). O motor nunca infere loci fora dele.
 */

import type { Allele, Dominance, Genotype, Sex, XLocusAlleles } from "@genbreedai/shared";

export type { Allele, Dominance, Genotype, Sex, XLocusAlleles };

/**
 * Regra de epistasia: quando o loco `modifierLocus` contém `whenAllelePresent`,
 * o fenótipo do `targetLocus` é sobrescrito por `override`.
 * Ex.: Harlequin (H) sobre Merle (M) → manchas merle viram branco (TDD §4.1).
 */
export interface EpistasisRule {
  modifierLocus: string;
  whenAllelePresent: Allele;
  targetLocus: string;
  /** Só dispara se o alvo estiver expressando este alelo (opcional). */
  targetWhenAllelePresent?: Allele;
  override: string;
  label: string;
}

/**
 * Combinação letal: genótipo homozigoto (ou par específico) que inviabiliza o
 * embrião. Ex.: M/M (duplo-merle) — TDD §4.1.
 */
export interface LethalCombo {
  locus: string;
  /** Par de alelos que, presentes juntos no zigoto, é letal. */
  genotype: [Allele, Allele];
  label: string;
}

/**
 * Expressão condicionada ao sexo de um traço (preparação p/ bovinos/ovinos —
 * TIPO SÓ, sem uso na resolução ainda). Default BOTH quando ausente.
 *   BOTH            — expressa igual nos dois sexos (padrão).
 *   SEX_LIMITED_F   — só se expressa em fêmeas (ex.: produção de leite).
 *   SEX_LIMITED_M   — só se expressa em machos (ex.: chifres em certas raças).
 *   SEX_INFLUENCED  — expressa nos dois sexos, mas com dominância diferente
 *                     conforme o sexo (ex.: calvície em carneiros).
 */
export type SexExpression = "BOTH" | "SEX_LIMITED_F" | "SEX_LIMITED_M" | "SEX_INFLUENCED";

/**
 * Definição de um loco dentro de um data pack.
 */
export interface LocusDef {
  name: string;
  /** Todos os alelos conhecidos deste loco. */
  alleles: Allele[];
  dominance: Dominance;
  /**
   * Hierarquia de dominância, do mais dominante ao mais recessivo.
   * Obrigatória para dominância COMPLETE com múltiplos alelos.
   */
  dominanceRank: Allele[];
  /**
   * Mapa alelo → descritor fenotípico usado na expressão.
   * Para INCOMPLETE/CODOMINANT, o heterozigoto usa `heteroPhenotype`.
   */
  phenotypeByAllele: Record<Allele, string>;
  /** Descritores de heterozigotos para dominância incompleta/codominante. */
  heteroPhenotype?: Record<string, string>;
  mutationRate: number;
  /** Ver `SexExpression`. Default BOTH — só tipo, não consultado na resolução ainda. */
  sexExpression?: SexExpression;
}

/**
 * Regra de interação TIPADA entre um loco ligado ao X e a via de pigmento
 * (ADR-0013) — formato PRÓPRIO, não reaproveita/altera `EpistasisRule`.
 *
 * `activeAllele` no loco `xLocus` desvia a via de eumelanina pra feomelanina:
 *   macho hemizigoto com `activeAllele`, ou fêmea homozigota `activeAllele/
 *   activeAllele` → PHEOMELANIN; fêmea heterozigota → MOSAIC (inativação do
 *   X); nenhum `activeAllele` → EUMELANIN. O padrão (loco de `P`) não é
 *   tocado por esta regra.
 */
export interface PigmentOverrideRule {
  kind: "pigmentOverride";
  /** Loco ligado ao X que decide a via de pigmento (ex.: "O"). */
  xLocus: string;
  /** Alelo desse loco que ativa a via feomelanina (ex.: "O"). */
  activeAllele: string;
  /** Loco autossômico de diluição (ex.: "D") — opcional. */
  dilutionLocus?: string;
  /** Alelo diluído desse loco (ex.: "d") — `dd` marca `pigmentDiluted`. */
  dilutedAllele?: string;
  /** Loco de padrão (ex.: "P") — opcional, só p/ o flag `ghostPattern`. */
  patternLocus?: string;
  /** Alelo desse loco cujo fenótipo resolvido conta como "padrão uniforme". */
  uniformPatternAllele?: string;
  label: string;
}

/** União de regras de interação tipadas. Hoje só `pigmentOverride`; extensível. */
export type InteractionRule = PigmentOverrideRule;

/**
 * Data pack de uma espécie/arquétipo: conjunto de loci + regras epistáticas +
 * letais + traços quantitativos.
 */
export interface SpeciesPack {
  id: string;
  slug: string;
  archetype: string;
  loci: Record<string, LocusDef>;
  /**
   * Loci ligados ao X (ADR-0013) — mesmo shape de `loci`, resolvidos à parte
   * por causa da hemizigose/mosaico. Pack sem nenhum: `{}` (ex.: canino).
   */
  xLoci: Record<string, LocusDef>;
  epistasis: EpistasisRule[];
  /** Regras tipadas (hoje só pigmentOverride). Ausente = nenhuma. */
  interactionRules?: InteractionRule[];
  lethals: LethalCombo[];
  /** QTLs conhecidos e sua herdabilidade h² (TDD §4.1). */
  quantitative: Record<string, { mean: number; h2: number }>;
  /**
   * Efeito materno por traço QTL (ADR-0014 — Walton & Hammond 1938). PARÂMETRO
   * DO JOGO, não constante biológica medida — ver o ADR pro campo "valores das
   * tabelas W&H usados" e a distinção do m de Falconer. Ausente = sem efeito
   * materno nesse traço (equivalente ao antigo m=0).
   */
  maternalEffect?: Record<string, MaternalEffectConfig>;
  /**
   * Taxonomia por espécie (ADR-0015): `biologicalSpecies` (slug) → gênero.
   * ESPELHA `packages/shared/src/species.ts` (SPECIES_INFO.genus) —
   * duplicado deliberadamente aqui pra o motor não depender de @genbreedai/
   * shared pra dados de negócio (só tipos). Se o catálogo de species.ts
   * mudar, atualizar aqui também. Ausente/vazio = pack sem espécies múltiplas
   * (ex.: canino, onde toda raça é "canis-familiaris").
   */
  speciesGenus?: Record<string, string>;
  /**
   * Gêneros cujo QUALQUER par de espécies distintas conta como
   * DOCUMENTED_FERTILE_FEMALE (ADR-0015) — hoje só "Panthera" no pack
   * felino. NÃO adicionar gênero sem ADR (item 2, Etapa 2c).
   */
  hybridGenusWhitelist?: string[];
  /**
   * Pares específicos (fora do gênero acima) DOCUMENTED_FERTILE_FEMALE, com
   * fonte citada (ADR-0015) — hoje só felis-catus×leptailurus-serval
   * (Savannah). NÃO adicionar par sem ADR (item 2, Etapa 2c).
   */
  hybridSpeciesWhitelist?: HybridWhitelistEntry[];
}

/**
 * Coeficientes do efeito materno num traço (ADR-0014). `mBirth`/`mAdult` são
 * a fração — em [0,1] — do desvio materno (porteAdultoMãe − médiaParentalBV)
 * que se expressa no nascimento e na maturidade, respectivamente. O efeito
 * DECAI mas não ZERA na maturidade (mAdult > 0, tipicamente < mBirth).
 */
export interface MaternalEffectConfig {
  mBirth: number;
  /** Faixa reportada por W&H pro efeito ao nascimento — documental, não usada no cálculo. */
  mBirthRange: [number, number];
  mAdult: number;
}

// ─── Classe de hibridação (ADR-0015, Etapa 2c) ─────────────────────────────────

/**
 * Classificação de um par de progenitores pra fins de fertilidade/Haldane
 * (ADR-0015) — SEMPRE derivada da identidade biológica dos PAIS
 * (`ParentInput.species`), NUNCA do rótulo `method` da cruza (ver cross.ts).
 *   SAME_SPECIES               — mesma `biologicalSpecies` (`species` é
 *                                 OBRIGATÓRIO em `ParentInput` — ADR-0015,
 *                                 correção pós-Etapa-2c; sem fallback pra
 *                                 ausência). Nunca é Haldane.
 *   DOCUMENTED_FERTILE_FEMALE  — par interespecífico CONHECIDO com hibridação
 *                                 REAL documentada (ver `hybridGenusWhitelist`/
 *                                 `hybridSpeciesWhitelist` do pack).
 *   UNDOCUMENTED                — qualquer outro par interespecífico CONHECIDO.
 */
export type HybridClass = "SAME_SPECIES" | "DOCUMENTED_FERTILE_FEMALE" | "UNDOCUMENTED";

/**
 * Par de espécies com hibridação documentada (ADR-0015) — fonte citada,
 * OBRIGATÓRIA. Ordem de `speciesA`/`speciesB` não importa (comparação
 * não-ordenada). NÃO adicionar par sem ADR (item 2, Etapa 2c).
 */
export interface HybridWhitelistEntry {
  speciesA: string;
  speciesB: string;
  /** Fonte citada (nome do híbrido real + evidência) — nunca "porque sim". */
  source: string;
}

// ─── Pedigree (para F de Wright, TDD §4.2) ────────────────────────────────────

/**
 * Nó de pedigree. `sire`/`dam` referenciam ids de ancestrais no mesmo mapa;
 * fundadores têm sire/dam nulos (não-endogâmicos, não-aparentados entre si).
 */
export interface PedigreeNode {
  id: string;
  sire: string | null;
  dam: string | null;
}

export type Pedigree = Record<string, PedigreeNode>;

// ─── Gametas ──────────────────────────────────────────────────────────────────

/** Um gameta carrega 1 alelo por loco + QTLs contribuídos + flags de mutação. */
export interface Gamete {
  loci: Record<string, Allele>;
  qtl: Record<string, number>;
  mutations: string[];
}

/**
 * Contribuição de UM progenitor ao sexo/loci ligados ao X do zigoto
 * (ADR-0013). Gerada por um RNG PRÓPRIO (não o `rng` autossômico) — ver
 * gamete.ts. `sexChromosome: "Y"` só é possível vindo de um macho; nesse
 * caso `xLoci` vem vazio (Y não carrega loci ligados ao X).
 */
export interface XGameteResult {
  sexChromosome: "X" | "Y";
  /** 1 alelo por loco ligado ao X presente no pack — vazio se `sexChromosome === "Y"`. */
  xLoci: Record<string, Allele>;
  mutations: string[];
}
