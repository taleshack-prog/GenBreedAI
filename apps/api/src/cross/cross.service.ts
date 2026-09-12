/**
 * Serviço de cruzamento (TDD §4.4). ANTI-P2W: probabilidades idênticas em todos
 * os tiers. Seleção fenotípica: Free/Junior = sorteio; Senior escolhe top-6; PhD
 * escolhe top-12. Escolher NÃO muda probabilidade — só materializa a opção.
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  cross as crossEngine, enumerateOffspring, materializeCross,
  CANINE_PACK, FELINE_PACK, type OffspringOption,
} from "@genbreedai/engine";
import { biologicalSpecies } from "@genbreedai/shared";
function biologicalSpeciesDiffer(a: StoredSpecimen, b: StoredSpecimen) { return biologicalSpecies(a.pack, a.species) !== biologicalSpecies(b.pack, b.species); }
/** Une espécies de híbrido sem repetir ancestrais. */
function combineSpecies(a: string, b: string) { if (a === b) return a; return [...new Set([...a.split("×"), ...b.split("×")])].join("×"); }
import type { BreedingMethod, Genotype, CrossResult, Tier } from "@genbreedai/shared";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import { assertTierAllows } from "../common/tier-access";
import { classifyCross, type CrossClassification } from "@genbreedai/engine";
import { WalletService } from "../economy/wallet.service";
import type { CrossDto } from "./dto/cross.dto";

const PACK_BY_FAMILY: Record<string, typeof CANINE_PACK> = { feline: FELINE_PACK, canine: CANINE_PACK };

/** Quantas opções o tier vê para escolher (analítico; não altera probabilidade). */
function optionCount(tier: Tier): number { return tier === "PHD" ? 12 : 6; }
/** A partir de Senior o jogador ESCOLHE o fenótipo. */
function canChoose(tier: Tier): boolean { return tier === "SENIOR" || tier === "PHD"; }

export interface CrossResponse { specimen: StoredSpecimen; cacheKey: string; engine: CrossResult["specimen"]; }
export interface OptionsResponse {
  canChoose: boolean; maxOptions: number;
  options: Array<{ key: string; prob: number; fixationIndex: number; aura: number; variants: number; phenotype: OffspringOption["phenotype"]; genotype: Genotype }>;
}

@Injectable()
export class CrossService {
  constructor(private readonly repo: SpecimenRepository, private readonly wallet: WalletService) {}

  private async resolve(dto: CrossDto) {
    const sire = await this.repo.get(dto.sireId);
    const dam = await this.repo.get(dto.damId);
    if (!sire) throw new NotFoundException(`Sire "${dto.sireId}" não encontrado.`);
    if (!dam) throw new NotFoundException(`Dam "${dto.damId}" não encontrado.`);
    if (sire.status === "FROZEN") throw new BadRequestException(`"${sire.id}" está congelado — descongele antes de cruzar.`);
    if (dam.status === "FROZEN") throw new BadRequestException(`"${dam.id}" está congelado — descongele antes de cruzar.`);
    if (sire.pack !== dam.pack) throw new BadRequestException(`Famílias distintas (${sire.pack} × ${dam.pack}).`);
    const pack = PACK_BY_FAMILY[sire.pack];
    if (!pack) throw new BadRequestException(`Família sem pack: ${sire.pack}.`);
    const interspecific = biologicalSpecies(sire.pack, sire.species) !== biologicalSpecies(dam.pack, dam.species);
    const pedigree = await this.repo.buildPedigree([sire.id, dam.id]);
    const a = { id: sire.id, genotype: sire.genotype, generation: sire.generation };
    const b = { id: dam.id, genotype: dam.genotype, generation: dam.generation };
    const ctx = { pack, pedigree, interspecific, targetLoci: dto.targetLoci, generationsUnderSelection: dto.generationsUnderSelection };
    return { sire, dam, a, b, ctx, interspecific };
  }

  /** Opções de prole para o tier (Senior/PhD podem escolher). */
  async options(tier: Tier, dto: CrossDto): Promise<OptionsResponse> {
    const { sire, dam, a, b, ctx, interspecific } = await this.resolve(dto);
    assertTierAllows(tier, sire.pack, dam.pack, interspecific);
    const opts = enumerateOffspring(a, b, ctx, optionCount(tier));
    return {
      canChoose: canChoose(tier), maxOptions: optionCount(tier),
      options: opts.map((o) => ({ key: o.key, prob: o.prob, fixationIndex: o.fixationIndex, aura: o.aura, variants: o.variants, phenotype: o.phenotype, genotype: o.genotype })),
    };
  }

  /** Resolve a opção escolhida em um "espécime de preview" (não persistido). */
  async resolveChoice(tier: Tier, dto: CrossDto): Promise<{ pack: string; species: string; genotype: Genotype }> {
    const { sire, dam, a, b, ctx, interspecific } = await this.resolve(dto);
    assertTierAllows(tier, sire.pack, dam.pack, interspecific);
    const opts = enumerateOffspring(a, b, ctx, optionCount(tier));
    const chosen = dto.choiceKey ? opts.find((o) => o.key === dto.choiceKey) : opts[0];
    if (!chosen) throw new BadRequestException("Opção de fenótipo inválida.");
    return { pack: sire.pack, species: combineSpecies(sire.species, dam.species), genotype: chosen.genotype };
  }

  /** Sugere o tipo de cruzamento (classificador determinístico) a partir dos pais. */
  async classify(dto: { sireId: string; damId: string }): Promise<CrossClassification> {
    const sire = await this.repo.get(dto.sireId);
    const dam = await this.repo.get(dto.damId);
    if (!sire) throw new NotFoundException(`Sire "${dto.sireId}" não encontrado.`);
    if (!dam) throw new NotFoundException(`Dam "${dto.damId}" não encontrado.`);
    const pedigree = await this.repo.buildPedigree([sire.id, dam.id]);
    return classifyCross({
      sireId: sire.id, damId: dam.id,
      sireSpecies: sire.species, damSpecies: dam.species,
      sireGeneration: sire.generation, damGeneration: dam.generation,
      pedigree,
    });
  }

  /** Calcula o resultado do cruzamento (resolve+gate+motor) SEM persistir. */
  async computeResult(tier: Tier, dto: CrossDto): Promise<{ result: CrossResult; sire: StoredSpecimen; dam: StoredSpecimen; species: string; pack: string }> {
    const { sire, dam, a, b, ctx } = await this.resolve(dto);
    const interspecific = sire.species !== dam.species;
    assertTierAllows(tier, sire.pack, dam.pack, biologicalSpeciesDiffer(sire, dam));
    const seed = dto.seed ?? `${dto.method}:${[sire.id, dam.id].sort().join("x")}`;
    let result: CrossResult;
    try {
      if (dto.choiceKey && canChoose(tier)) {
        const opts = enumerateOffspring(a, b, ctx, optionCount(tier));
        const chosen = opts.find((o) => o.key === dto.choiceKey);
        if (!chosen) throw new BadRequestException("Opção de fenótipo inválida (não está entre as prováveis).");
        result = materializeCross(a, b, dto.method as BreedingMethod, seed, ctx, chosen.genotype);
      } else {
        result = crossEngine(a, b, dto.method as BreedingMethod, seed, ctx);
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException("GENÓTIPO INCOMPATÍVEL: rode `pnpm --filter @genbreedai/api db:reset`. Detalhe: " + (e as Error).message);
    }
    return { result, sire, dam, species: interspecific ? combineSpecies(sire.species, dam.species) : sire.species, pack: sire.pack };
  }

  async execute(ownerId: string, tier: Tier, dto: CrossDto): Promise<CrossResponse> {
    const { result, sire, dam, species, pack } = await this.computeResult(tier, dto);
    const stored = await this.repo.save({
      id: "", ownerId, pack: pack as "feline" | "canine", species,
      genotype: result.specimen.genotype as Genotype, generation: result.specimen.generation,
      sireId: sire.id, damId: dam.id, method: dto.method,
      fPedigree: result.specimen.fPedigree, fixationIndex: result.specimen.fixationIndex,
      aura: result.specimen.aura, cacheKey: result.cacheKey, status: "ALIVE",
    });
    await this.wallet.rewardForCross(ownerId, result.specimen.aura).catch(() => {}); // fonte: fixação
    return { specimen: stored, cacheKey: result.cacheKey, engine: result.specimen };
  }
}
