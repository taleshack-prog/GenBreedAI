/**
 * Controller POST /api/v1/cross (TDD §8).
 * Ordem dos guards: AuthGuard (identidade) → QuotaGuard (cota anti-P2W).
 * 201 Created | 400 Bad Request | 401 Unauthorized | 429 Too Many Requests.
 */

import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { QuotaGuard } from "../quota/quota.guard";
import { CrossService } from "./cross.service";
import { CrossDto } from "./dto/cross.dto";

@Controller("api/v1/cross")
export class CrossController {
  constructor(private readonly service: CrossService) {}

  @Post()
  @UseGuards(AuthGuard, QuotaGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrossDto) {
    return this.service.execute(user.id, user.tier, dto);
  }

  @Post("options")
  @UseGuards(AuthGuard)
  options(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrossDto) {
    return this.service.options(user.tier, dto);
  }

  @Post("classify")
  @UseGuards(AuthGuard)
  classify(@Body() dto: { sireId: string; damId: string }) {
    return this.service.classify(dto);
  }
}
