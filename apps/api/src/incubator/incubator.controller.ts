/**
 * Incubadora (ADR-0021): GET lista (estado NA_INCUBADORA|GESTANDO|NASCIDO),
 * POST .../gestate consome a vaga de birthQuota (inicia a gestação, prazo
 * pela aura), POST .../born só depois do prazo (gera a imagem, materializa o
 * espécime, grátis — a vaga já foi paga na gestação), DELETE descarta.
 * Rotas `.../reveal` e `.../freeze` (ADR-0020) saíram — não existe mais
 * revelação avulsa nem congelamento neste modelo.
 */
import { Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { TierService } from "../billing/tier.service";
import { IncubatorService } from "./incubator.service";

@Controller("api/v1/incubator")
export class IncubatorController {
  constructor(private readonly incubator: IncubatorService, private readonly tier: TierService) {}

  @Get()
  @UseGuards(AuthGuard)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.incubator.list(user.id);
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
