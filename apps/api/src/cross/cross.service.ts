/**
 * Serviço de cruzamento — orquestra o motor (TDD §4.4). ANTI-P2W: não recebe tier.
 * Pack por família do espécime (FELINO → FELINE_PACK, CANINO → CANINE_PACK).
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { cross as crossEngine, CANINE_PACK, FELINE_PACK } from "@genbreedai/engine";
import type { BreedingMethod, Genotype, CrossResult } from "@genbreedai/shared";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import type { CrossDto } from "./dto/cross.dto";
import type { Tier } from "@genbreedai/shared";
import { assertTierAllows } from "../common/tier-access";

const PACK_BY_FAMILY: Record<string, typeof CANINE_PACK> = { feline: FELINE_PACK, canine: CANINE_PACK };

export interface CrossResponse {
  specimen: StoredSpecimen; cacheKey: string; engine: CrossResult["specimen"];
}

@Injectable()
export class CrossService {
  constructor(private readonly repo: SpecimenRepository) {}

  async execute(ownerId: string, tier: Tier, dto: CrossDto): Promise<CrossResponse> {
    const sire = await this.repo.get(dto.sireId);
    const dam = await this.repo.get(dto.damId);
    if (!sire) throw new NotFoundException(`Sire "${dto.sireId}" não encontrado.`);
    if (!dam) throw new NotFoundException(`Dam "${dto.damId}" não encontrado.`);
    if (sire.pack !== dam.pack)
      throw new BadRequestException(`Cruzamento entre famílias distintas (${sire.pack} × ${dam.pack}) não é permitido.`);

    const pack = PACK_BY_FAMILY[sire.pack];
    if (!pack) throw new BadRequestException(`Família sem pack genético: ${sire.pack}.`);

    const interspecific = sire.species !== dam.species;
    assertTierAllows(tier, sire.pack, dam.pack, interspecific);
    const pedigree = await this.repo.buildPedigree([sire.id, dam.id]);
    const seed = dto.seed ?? `${dto.method}:${[sire.id, dam.id].sort().join("x")}`;

    let result;
    try {
      result = crossEngine(
        { id: sire.id, genotype: sire.genotype, generation: sire.generation },
        { id: dam.id, genotype: dam.genotype, generation: dam.generation },
        dto.method as BreedingMethod, seed,
        { pack, pedigree, interspecific, targetLoci: dto.targetLoci, generationsUnderSelection: dto.generationsUnderSelection },
      );
    } catch (e) {
      throw new BadRequestException(
        "GENÓTIPO INCOMPATÍVEL: um progenitor usa um modelo genético antigo. Rode `pnpm --filter @genbreedai/api db:reset`. Detalhe: " + (e as Error).message,
      );
    }

    const stored = await this.repo.save({
      id: "", ownerId, pack: sire.pack,
      species: interspecific ? `${sire.species}×${dam.species}` : sire.species,
      genotype: result.specimen.genotype as Genotype, generation: result.specimen.generation,
      sireId: sire.id, damId: dam.id, method: dto.method,
      fPedigree: result.specimen.fPedigree, fixationIndex: result.specimen.fixationIndex,
      aura: result.specimen.aura, cacheKey: result.cacheKey,
    });
    return { specimen: stored, cacheKey: result.cacheKey, engine: result.specimen };
  }
}
