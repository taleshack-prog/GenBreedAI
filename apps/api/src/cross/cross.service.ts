/**
 * Serviço de cruzamento — orquestra a chamada ao motor genético.
 *
 * ANTI-P2W (TDD §0): este serviço NÃO recebe nem consulta o tier do usuário. O
 * resultado depende apenas de (genótipos + método + seed). O tier é tratado
 * antes, no QuotaGuard, e nunca chega aqui.
 */

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { cross, CANINE_PACK, FELINE_PACK } from "@genbreedai/engine";
import type { BreedingMethod, Genotype, CrossResult } from "@genbreedai/shared";
import {
  SpecimenRepository,
  type PackId,
  type StoredSpecimen,
} from "../specimens/in-memory.repository";
import type { CrossDto } from "./dto/cross.dto";

const PACKS = { canine: CANINE_PACK, feline: FELINE_PACK } as const;

export interface CrossResponse {
  specimen: StoredSpecimen;
  cacheKey: string;
  engine: CrossResult["specimen"];
}

@Injectable()
export class CrossService {
  constructor(private readonly repo: SpecimenRepository) {}

  async execute(ownerId: string, dto: CrossDto): Promise<CrossResponse> {
    const sire = await this.repo.get(dto.sireId);
    const dam = await this.repo.get(dto.damId);
    if (!sire) throw new NotFoundException(`Sire "${dto.sireId}" não encontrado.`);
    if (!dam) throw new NotFoundException(`Dam "${dto.damId}" não encontrado.`);
    if (sire.pack !== dam.pack) {
      throw new BadRequestException(
        `Progenitores de packs distintos (${sire.pack} × ${dam.pack}).`,
      );
    }

    const pack = PACKS[sire.pack as PackId];
    const pedigree = await this.repo.buildPedigree([sire.id, dam.id]);
    const interspecific = sire.species !== dam.species;

    // Seed determinística default: método + ids ordenados (reprodutível).
    const seed = dto.seed ?? `${dto.method}:${[sire.id, dam.id].sort().join("x")}`;

    const result = cross(
      { id: sire.id, genotype: sire.genotype, generation: sire.generation },
      { id: dam.id, genotype: dam.genotype, generation: dam.generation },
      dto.method as BreedingMethod,
      seed,
      {
        pack,
        pedigree,
        interspecific,
        targetLoci: dto.targetLoci,
        generationsUnderSelection: dto.generationsUnderSelection,
      },
    );

    const stored = await this.repo.save({
      id: "",
      ownerId,
      pack: sire.pack,
      species: interspecific ? `${sire.species}×${dam.species}` : sire.species,
      genotype: result.specimen.genotype as Genotype,
      generation: result.specimen.generation,
      sireId: sire.id,
      damId: dam.id,
      method: dto.method,
      fPedigree: result.specimen.fPedigree,
      fixationIndex: result.specimen.fixationIndex,
      aura: result.specimen.aura,
      cacheKey: result.cacheKey,
    });

    return { specimen: stored, cacheKey: result.cacheKey, engine: result.specimen };
  }
}
