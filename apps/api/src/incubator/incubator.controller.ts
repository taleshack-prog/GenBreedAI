/**
 * Incubadora (ADR-0021): GET lista, PAGINADA (`limit`/`cursor`) e
 * filtrável por estado no SERVIDOR (`state` — NA_INCUBADORA|GESTANDO|
 * PRONTO|NASCIDO), com contagem completa por estado sempre junto (ADR-0021
 * item 2, rodada de paginação). POST .../gestate consome a vaga de
 * birthQuota (inicia a gestação, prazo pela aura), POST .../born só depois
 * do prazo (gera a imagem, materializa o espécime, grátis — a vaga já foi
 * paga na gestação), DELETE descarta. Rotas `.../reveal` e `.../freeze`
 * (ADR-0020) saíram — não existe mais revelação avulsa nem congelamento
 * neste modelo.
 */
import { BadRequestException, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { TierService } from "../billing/tier.service";
import { IncubatorService } from "./incubator.service";
import type { IncubatorState } from "./in-memory.repository";

const VALID_STATES: readonly IncubatorState[] = ["NA_INCUBADORA", "GESTANDO", "PRONTO", "NASCIDO"];

@Controller("api/v1/incubator")
export class IncubatorController {
  constructor(private readonly incubator: IncubatorService, private readonly tier: TierService) {}

  @Get()
  @UseGuards(AuthGuard)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("limit") limitRaw?: string,
    @Query("cursor") cursor?: string,
    @Query("state") stateRaw?: string,
  ) {
    let limit: number | undefined;
    if (limitRaw !== undefined) {
      limit = Number(limitRaw);
      if (!Number.isFinite(limit) || !Number.isInteger(limit)) throw new BadRequestException("limit precisa ser um inteiro.");
    }
    let state: IncubatorState | undefined;
    if (stateRaw !== undefined) {
      if (!VALID_STATES.includes(stateRaw as IncubatorState)) {
        throw new BadRequestException(`state inválido — use um de: ${VALID_STATES.join(", ")}.`);
      }
      state = stateRaw as IncubatorState;
    }
    return this.incubator.list(user.id, { limit, cursor, state });
  }

  @Post(":id/gestate")
  @UseGuards(AuthGuard)
  async gestate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.incubator.gestate(id, user.id, tier);
  }

  @Post(":id/born")
  @UseGuards(AuthGuard)
  async born(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.incubator.born(id, user.id, tier);
  }

  @Delete(":id")
  @UseGuards(AuthGuard)
  discard(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.incubator.discard(id, user.id);
  }
}
