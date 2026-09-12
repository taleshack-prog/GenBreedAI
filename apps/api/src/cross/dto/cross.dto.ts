/**
 * DTO de entrada de POST /api/v1/cross (TDD §8).
 * Referencia dois espécimes do usuário (sire/dam) por id — o motor recebe apenas
 * genótipo+método+seed; nenhum campo de tier trafega para o motor (anti-P2W).
 */

import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import type { BreedingMethod } from "@genbreedai/shared";

const METHODS: BreedingMethod[] = ["F1", "F2", "F3", "BC1", "LINE", "INBREED", "OUTCROSS"];

export class CrossDto {
  @IsString()
  @MinLength(1)
  sireId!: string;

  @IsString()
  @MinLength(1)
  damId!: string;

  @IsIn(METHODS)
  method!: BreedingMethod;

  /** Seed opcional; se ausente, o serviço deriva uma determinística. */
  @IsOptional()
  @IsString()
  seed?: string;

  /** Loci-alvo do IF (opcional). */
  @IsOptional()
  targetLoci?: string[];

  /** Gerações sob seleção direcionada (opcional). */
  @IsOptional()
  generationsUnderSelection?: number;

  /** Chave do genótipo escolhido (Senior/PhD) — materializa a seleção fenotípica. */
  @IsOptional()
  @IsString()
  choiceKey?: string;
}
