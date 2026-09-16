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
  type Sex,
} from "@genbreedai/shared";
import type { HybridClass, MaternalEffectConfig, Pedigree, SpeciesPack } from "./types";
import { createPrng } from "./rng";
import { generateGamete, combineGametes, generateXGamete, combineXGametes } from "./gamete";
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
  /** Sexo cromossômico (ADR-0013). cross()/enumerateOffspring()/materializeCross() exigem parentA=M, parentB=F. */
  sex: Sex;
  /**
   * Porte ADULTO (fenótipo, com efeito materno já aplicado) deste indivíduo
   * quando ELE nasceu — ADR-0014. Só importa no papel de DAM (parentB); é o
   * "porteAdultoMãe" da fórmula. Ausente = desvio materno tratado como 0
   * (nunca inventa o valor) — quem chama é responsável por repassar o
   * `phenotype.porteAdulto` da geração anterior, se tiver.
   */
  adultPorte?: number;
  /**
   * Espécie BIOLÓGICA deste indivíduo (ADR-0015) — OBRIGATÓRIO. Já
   * normalizada pelo chamador via `biologicalSpecies()` de @genbreedai/
   * shared (morfos de cor colapsados na espécie selvagem; o motor NÃO
   * importa o catálogo de espécies, só recebe o slug pronto). Usada por
   * `hybridClass()` pra decidir Haldane em F1 interespecífico. Pra caninos,
   * é sempre "canis-familiaris" (toda raça é a mesma espécie biológica) —
   * ver `biologicalSpecies("canine", ...)`. Campo obrigatório desde
   * ADR-0015 (correção — a versão anterior tinha fallback "ausente ⇒
   * SAME_SPECIES", removido: exigir o dado explicitamente é mais seguro que
   * inferir por ausência).
   */
  species: string;
  /**
   * Fertilidade (score 0–100) já conhecida deste indivíduo, de um cruzamento
   * anterior (ADR-0015, item 4) — só usada pro GATE de reprodução (ver
   * `validateBreedingConstraints`). Ausente = fertilidade desconhecida, NÃO
   * bloqueia (nunca inventa esterilidade sem dado); só `fertility === 0`
   * explícito rejeita.
   */
  fertility?: number;
}

/**
 * Erro TIPADO (ADR-0013): cross()/enumerateOffspring()/materializeCross()
 * exigem sire (parentA) macho e dam (parentB) fêmea — `instanceof
 * SexMismatchError`, nunca um `Error` genérico de string solta.
 */
export class SexMismatchError extends Error {
  constructor(public readonly sireSex: Sex, public readonly damSex: Sex) {
    super(`Cruzamento exige sire macho (M) e dam fêmea (F) — recebido sire=${sireSex}, dam=${damSex}.`);
    this.name = "SexMismatchError";
  }
}

/**
 * Erro TIPADO (ADR-0015, item 4): gate de reprodução — um parental com
 * `fertility === 0` (conhecido, explícito) não pode ser sire nem dam. SÓ
 * gate: não modela probabilidade de concepção (isso mudaria o consumo de rng
 * dos goldens — fora de escopo desta etapa).
 */
export class SterileParentError extends Error {
  constructor(public readonly parentId: string, public readonly role: "sire" | "dam") {
    super(`Espécime estéril não pode reproduzir (${role}: "${parentId}", fertility=0).`);
    this.name = "SterileParentError";
  }
}

export interface CrossContext {
  pack: SpeciesPack;
  /** Pedigree contendo pai, mãe e ancestrais comuns (para F_pedigree). */
  pedigree: Pedigree;
  /**
   * @deprecated (ADR-0015, item 3) NÃO é mais consumido pelo motor — Haldane
   * agora deriva de `hybridClass(parentA, parentB, pack)` (identidade real
   * dos pais via `ParentInput.species`), nunca de um boolean solto. Mantido
   * só porque apps/api ainda constrói `ctx` com este campo (Etapa 5-API
   * decide se remove); ignorado por `finalizeSpecimen`.
   */
  interspecific?: boolean;
  /** Loci que o jogador tenta fixar (para o IF). Default: todos os loci. */
  targetLoci?: string[];
  /** Gerações sob seleção direcionada (para o IF). Default: geração da prole. */
  generationsUnderSelection?: number;
  /** Sobrescreve µ de mutação (uso em testes). Default: por-loco do pack. */
  mutationRateOverride?: number;
}

/** Validação de restrições de cruzamento (TDD §4.4, passo 1; sexo — ADR-0013; fertilidade — ADR-0015). */
export function validateBreedingConstraints(
  parentA: ParentInput,
  parentB: ParentInput,
  pack: SpeciesPack,
): void {
  if (parentA.sex !== "M" || parentB.sex !== "F") {
    throw new SexMismatchError(parentA.sex, parentB.sex);
  }
  // Gate de fertilidade (ADR-0015, item 4): só rejeita fertility === 0
  // EXPLÍCITO — ausência de dado (undefined) nunca bloqueia (não inventa
  // esterilidade sem informação). SÓ gate — não modela probabilidade de
  // concepção (não consome rng, não muda os goldens).
  if (parentA.fertility === 0) throw new SterileParentError(parentA.id, "sire");
  if (parentB.fertility === 0) throw new SterileParentError(parentB.id, "dam");
  const packLoci = new Set(Object.keys(pack.loci));
  for (const p of [parentA, parentB]) {
    for (const locus of Object.keys(p.genotype.loci)) {
      if (!packLoci.has(locus)) {
        throw new Error(
          `Loco "${locus}" do espécime ${p.id} não pertence ao pack ${pack.slug}.`,
        );
      }
    }
    const packXLoci = new Set(Object.keys(pack.xLoci));
    for (const locus of Object.keys(p.genotype.xLoci ?? {})) {
      if (!packXLoci.has(locus)) {
        throw new Error(
          `Loco ligado ao X "${locus}" do espécime ${p.id} não pertence ao pack ${pack.slug}.`,
        );
      }
    }
  }
}

/**
 * Classe de hibridação de um par de progenitores (ADR-0015, item 2) — SEMPRE
 * derivada da identidade biológica dos PAIS (`ParentInput.species`), NUNCA do
 * rótulo `method` da cruza que vai ser executada (uma cruza "BC1" entre dois
 * indivíduos de espécies diferentes tem a MESMA hybridClass que teria como
 * "F1" — quem decide Haldane em fertilityScore é o método E a classe juntos).
 *
 *   SAME_SPECIES              — `species` igual nos dois lados.
 *   DOCUMENTED_FERTILE_FEMALE — espécies DIFERENTES, em
 *                                `pack.hybridGenusWhitelist` (mesmo gênero,
 *                                ambos em `pack.speciesGenus`) OU em
 *                                `pack.hybridSpeciesWhitelist` (par nomeado).
 *   UNDOCUMENTED               — qualquer outro par de espécies diferentes.
 *
 * `ParentInput.species` é OBRIGATÓRIO (ADR-0015, correção pós-Etapa-2c) —
 * removido o fallback anterior "ausente ⇒ SAME_SPECIES". Exigir o dado
 * explicitamente é mais seguro que inferir por ausência: o fallback existia
 * só porque `species` era opcional e quase nenhum chamador o preenchia; com
 * o campo obrigatório, TypeScript já impede a omissão em tempo de
 * compilação — não há mais "ausência" legítima a tratar aqui.
 */
export function hybridClass(parentA: ParentInput, parentB: ParentInput, pack: SpeciesPack): HybridClass {
  const spA = parentA.species;
  const spB = parentB.species;
  if (spA === spB) return "SAME_SPECIES";

  const genusA = pack.speciesGenus?.[spA];
  const genusB = pack.speciesGenus?.[spB];
  if (genusA && genusA === genusB && pack.hybridGenusWhitelist?.includes(genusA)) {
    return "DOCUMENTED_FERTILE_FEMALE";
  }

  const explicit = pack.hybridSpeciesWhitelist?.some(
    (w) => (w.speciesA === spA && w.speciesB === spB) || (w.speciesA === spB && w.speciesB === spA),
  );
  return explicit ? "DOCUMENTED_FERTILE_FEMALE" : "UNDOCUMENTED";
}

/**
 * cacheKey determinístico (ADR-0017) — ÚNICA implementação: nenhum outro
 * lugar do código (API incluída — `apps/api/src/images/image.service.ts`)
 * recalcula esta fórmula por conta própria; todos chamam esta função.
 *
 * `sex` OPCIONAL: sexo entra na chave SOMENTE se este `genotype` tiver algum
 * locus SEX_LIMITED cujo fenótipo REALMENTE difira entre os sexos (ex.: leão
 * Ma/Ma — macho tem juba, fêmea não). Comparação FEITA (não um mero "o pack
 * tem algum locus SEX_LIMITED"): reexpressa o MESMO genótipo com o sexo
 * oposto e compara `phenotype.loci` — se idêntico (ex.: onça ma/ma, nunca
 * expressa juba em nenhum sexo) OU se `sex` não foi informado, o resultado é
 * BYTE-IDÊNTICO à fórmula antiga (sem sufixo de sexo) — gêmeos sem diferença
 * visual reusam a mesma imagem. `expressPhenotype()` é pura (não consome
 * RNG), então esta chamada extra nunca perturba nenhum stream de sorteio.
 */
export function computeCacheKey(genotype: Genotype, pack: SpeciesPack, sex?: Sex): string {
  const base = hashGenotype(genotype) + "|" + pack.id + "|" + CURRENT_ART_VERSION;
  if (sex === undefined) return sha256(base);
  const oppositeSex: Sex = sex === "M" ? "F" : "M";
  const phenotype = expressPhenotype(genotype, pack, sex);
  const oppositePhenotype = expressPhenotype(genotype, pack, oppositeSex);
  const sexAffectsAppearance = JSON.stringify(phenotype.loci) !== JSON.stringify(oppositePhenotype.loci);
  return sha256(base + (sexAffectsAppearance ? "|" + sex : ""));
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

/**
 * Efeito materno no porte (ADR-0014 — Walton & Hammond 1938). PURA função dos
 * valores JÁ COMPUTADOS (BV do zigoto, BV dos pais, porteAdulto conhecido da
 * mãe) — NENHUM sorteio novo, então nunca perturba nenhum stream de RNG.
 *
 * `zygoteBV` já inclui o "ruído atual" da segregação (ADR-0012) — por isso
 * porteAdulto/porteNascimento reusam o MESMO ruído: não sorteia um segundo.
 * Sem `damAdultPorte` conhecido, o desvio materno é 0 (nunca inventa valor) —
 * porteAdulto/porteNascimento saem iguais ao BV, como antes desta ADR.
 */
function applyMaternalEffect(
  zygoteBV: number, sireBV: number, damBV: number,
  damAdultPorte: number | undefined, cfg: MaternalEffectConfig,
): { porteAdulto: number; porteNascimento: number } {
  const midparentBV = (sireBV + damBV) / 2;
  const deviation = damAdultPorte !== undefined ? damAdultPorte - midparentBV : 0;
  return {
    porteAdulto: clamp01(zygoteBV + cfg.mAdult * deviation),
    porteNascimento: clamp01(zygoteBV + cfg.mBirth * deviation),
  };
}

/**
 * Finaliza um zigoto: sexo+xLoci, fenótipo, F, fertilidade, IF, aura, cacheKey.
 *
 * O sexo/xLoci usa um RNG PRÓPRIO derivado da mesma seed (`${seed}|x`) — NUNCA
 * o `rng` autossômico recebido em `rng`. Isso é o que garante que packs com
 * xLoci não-vazio (ex. felino) não mudem NENHUM valor já golden-testado: o
 * stream consumido pelos loci autossômicos/QTL/fertilidade é bit-a-bit o
 * mesmo de antes da ADR-0013, em qualquer pack.
 */
function finalizeSpecimen(
  zygote: Genotype, parentA: ParentInput, parentB: ParentInput,
  method: BreedingMethod, ctx: CrossContext, rng: ReturnType<typeof createPrng>, seed: string,
): CrossResult {
  const xRng = createPrng(`${seed}|x`);
  const sireX = generateXGamete(parentA.sex, parentA.genotype.xLoci, ctx.pack.xLoci, xRng, ctx.mutationRateOverride);
  const damX = generateXGamete(parentB.sex, parentB.genotype.xLoci, ctx.pack.xLoci, xRng, ctx.mutationRateOverride);
  const { sex, xLoci } = combineXGametes(sireX, damX, Object.keys(ctx.pack.xLoci));
  const zygoteWithX: Genotype = { ...zygote, xLoci };

  const phenotype = expressPhenotype(zygoteWithX, ctx.pack, sex);

  // Efeito materno (ADR-0014) — PROIBIDO gravar em genotype.qtl; só no phenotype.
  const maternalCfg = ctx.pack.maternalEffect?.porte;
  const zygoteBV = zygote.qtl.porte;
  const sireBV = parentA.genotype.qtl.porte;
  const damBV = parentB.genotype.qtl.porte;
  if (maternalCfg && zygoteBV !== undefined && sireBV !== undefined && damBV !== undefined) {
    const { porteAdulto, porteNascimento } = applyMaternalEffect(zygoteBV, sireBV, damBV, parentB.adultPorte, maternalCfg);
    phenotype.porteAdulto = porteAdulto;
    phenotype.porteNascimento = porteNascimento;
  }

  const fPedigree = wrightF(ctx.pedigree, parentA.id, parentB.id);
  // Haldane por sexo (ADR-0015): `sex` é o do ZIGOTO (já resolvido acima, via
  // combineXGametes), `hybridClass` vem SEMPRE dos PAIS — nunca do `method`.
  let fertility = fertilityScore(method, fPedigree, { sex, hybridClass: hybridClass(parentA, parentB, ctx.pack), rng });
  // ADR-0018: macho cuja ASCENDÊNCIA mistura mais de uma espécie biológica é
  // estéril, em QUALQUER método (estende Haldane além do F1 — fertilityScore
  // acima só cobre o F1). Componentes = união de parentA.species.split("×")
  // e parentB.species.split("×"), deduplicada — `species` já chega
  // normalizado pelo CHAMADOR (o motor não consulta catálogo). Aplicado
  // DEPOIS do cálculo acima, sem consumir rng extra (mesma ordem de
  // sorteios de antes desta ADR). Fêmeas e intraespécie (1 componente):
  // sem mudança.
  const biologicalComponents = new Set([...parentA.species.split("×"), ...parentB.species.split("×")]);
  if (sex === "M" && biologicalComponents.size > 1) {
    fertility = {
      ...fertility,
      score: 0,
      haldaneStatus: "STERILE",
      // @deprecated (ADR-0015) — mantido em sincronia com haldaneStatus, ver JSDoc do campo em @genbreedai/shared.
      haldaneSterile: true,
      notes: [...fertility.notes, "Macho híbrido estéril (Regra de Haldane estendida além do F1 — ADR-0018)."],
    };
  }
  const generation = Math.max(parentA.generation, parentB.generation) + 1;
  const targetLoci = ctx.targetLoci ?? Object.keys(zygote.loci);
  const generationsUnderSelection = ctx.generationsUnderSelection ?? generation;
  const fixation = fixationIndex({ genotype: zygote, targetLoci, fPedigree, generationsUnderSelection });
  const aura = mapFixationToAura(fixation.index);
  // ADR-0017: fórmula ÚNICA de cacheKey — ver computeCacheKey() acima.
  const cacheKey = computeCacheKey(zygote, ctx.pack, sex);
  return {
    specimen: { genotype: zygoteWithX, phenotype, fPedigree: Number(fPedigree.toFixed(6)), fertility, fixationIndex: fixation.index, aura, generation, method, sex },
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
  return finalizeSpecimen(zygote, parentA, parentB, method, ctx, rng, seed);
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

  // Efeito materno no preview (ADR-0014, correção item 2): mesma fórmula pura
  // de finalizeSpecimen, reusando o BV JÁ sorteado por opção — nenhum sorteio
  // novo. Sem `parentB.adultPorte` conhecido, `applyMaternalEffect` já trata o
  // desvio como 0 (ver função), então o preview cai de volta no BV puro.
  const maternalCfg = ctx.pack.maternalEffect?.porte;
  const sireBV = parentA.genotype.qtl.porte;
  const damBV = parentB.genotype.qtl.porte;

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

    let phenotype = g.phenotype;
    if (maternalCfg && qtl.porte !== undefined && sireBV !== undefined && damBV !== undefined) {
      const { porteAdulto, porteNascimento } = applyMaternalEffect(qtl.porte, sireBV, damBV, parentB.adultPorte, maternalCfg);
      phenotype = { ...phenotype, porteAdulto, porteNascimento };
    }

    return {
      genotype, prob: g.prob, phenotype,
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
  return finalizeSpecimen(chosenGenotype, parentA, parentB, method, ctx, rng, seed);
}
