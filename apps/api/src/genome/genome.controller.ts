import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { TierService } from "../billing/tier.service";
import { GenomeService } from "./genome.service";

@Controller("api/v1/specimens/:id/genome")
export class GenomeController {
  constructor(private readonly genome: GenomeService, private readonly tierService: TierService) {}
  @Get()
  @UseGuards(AuthGuard)
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const tier = await this.tierService.resolve(user.id, user.tier);
    return this.genome.get(id, tier);
  }
}
