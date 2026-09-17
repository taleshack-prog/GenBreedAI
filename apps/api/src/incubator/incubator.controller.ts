/**
 * Incubadora (ADR-0020): GET lista, POST .../reveal consome revealQuota (gera
 * o retrato), POST .../born materializa o espécime (grátis, reaproveita a
 * imagem revelada), POST .../freeze preserva revelada-não-nascida (custa
 * catalisadores), DELETE descarta.
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

  @Post(":id/reveal")
  @UseGuards(AuthGuard)
  async reveal(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.incubator.reveal(id, user.id, tier);
  }

  @Post(":id/born")
  @UseGuards(AuthGuard)
  born(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.incubator.born(id, user.id);
  }

  @Post(":id/freeze")
  @UseGuards(AuthGuard)
  freeze(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.incubator.freeze(id, user.id);
  }

  @Delete(":id")
  @UseGuards(AuthGuard)
  discard(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.incubator.discard(id, user.id);
  }
}
