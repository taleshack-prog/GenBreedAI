import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { GenomeService } from "./genome.service";

@Controller("api/v1/specimens/:id/genome")
export class GenomeController {
  constructor(private readonly genome: GenomeService) {}
  @Get()
  @UseGuards(AuthGuard)
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.genome.get(id, user.tier);
  }
}
