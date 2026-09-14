/**
 * Controller POST /api/v1/cross (TDD §8).
 * Ordem dos guards: AuthGuard (identidade) → QuotaGuard (cota anti-P2W).
 * 201 Created | 400 Bad Request | 401 Unauthorized | 429 Too Many Requests.
 */

import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { QuotaGuard } from "../quota/quota.guard";
import { TierService } from "../billing/tier.service";
import { CrossService } from "./cross.service";
import { CrossDto } from "./dto/cross.dto";

@Controller("api/v1/cross")
export class CrossController {
  constructor(private readonly service: CrossService, private readonly tier: TierService) {}

  @Post()
  @UseGuards(AuthGuard, QuotaGuard)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrossDto) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.service.execute(user.id, tier, dto);
  }

  @Post("options")
  @UseGuards(AuthGuard)
  async options(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrossDto) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.service.options(tier, dto);
  }

  @Post("classify")
  @UseGuards(AuthGuard)
  classify(@Body() dto: { sireId: string; damId: string }) {
    return this.service.classify(dto);
  }
}
