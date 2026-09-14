/**
 * GET /api/v1/specimens — lista os espécimes do usuário (TDD §8).
 * Usado pelo Laboratório (web) para popular os seletores de sire/dam.
 */
import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { familyVisibleAtTier } from "../common/tier-access";
import { TierService } from "../billing/tier.service";
import { SpecimenRepository } from "./in-memory.repository";

@Controller("api/v1/specimens")
export class SpecimensController {
  constructor(private readonly repo: SpecimenRepository, private readonly tierService: TierService) {}

  @Get()
  @UseGuards(AuthGuard)
  async list(@CurrentUser() user: AuthenticatedUser) {
    const tier = await this.tierService.resolve(user.id, user.tier);
    const all = await this.repo.listByOwner(user.id);
    return all.filter((sp) => familyVisibleAtTier(tier, sp.pack));
  }
}
