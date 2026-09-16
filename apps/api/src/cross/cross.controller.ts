/**
 * Controller POST /api/v1/cross (TDD §8).
 * Ordem dos guards: AuthGuard (identidade) → QuotaGuard (cota anti-P2W).
 * 201 Created | 400 Bad Request | 401 Unauthorized | 429 Too Many Requests.
 */

import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { QuotaGuard } from "../quota/quota.guard";
import { QuotaService } from "../quota/quota.service";
import { TierService } from "../billing/tier.service";
import { CrossService } from "./cross.service";
import { CrossDto } from "./dto/cross.dto";

@Controller("api/v1/cross")
export class CrossController {
  constructor(
    private readonly service: CrossService,
    private readonly tier: TierService,
    private readonly quota: QuotaService,
  ) {}

  @Post()
  @UseGuards(AuthGuard, QuotaGuard)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrossDto) {
    const tier = await this.tier.resolve(user.id, user.tier);
    // QuotaGuard já reservou 1 cruzamento (tryConsume, atômico). Se o
    // serviço falhar por qualquer motivo, a reserva é estornada — a cota do
    // usuário não pode cair por uma tentativa que não gerou espécime algum.
    // Sem sucesso, não há débito extra: a reserva do guard JÁ É o débito.
    try {
      return await this.service.execute(user.id, tier, dto);
    } catch (e) {
      this.quota.release(user.id);
      throw e;
    }
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
