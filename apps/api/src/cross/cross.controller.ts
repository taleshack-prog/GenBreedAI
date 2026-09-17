/**
 * Controller POST /api/v1/cross (TDD §8).
 * Ordem dos guards: AuthGuard (identidade) → QuotaGuard (cota anti-P2W,
 * ADR-0019 — reserva persistida, não mais só em memória).
 * 201 Created | 400 Bad Request | 401 Unauthorized | 429 Too Many Requests.
 */

import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { QuotaGuard, type CrossReservedRequest } from "../quota/quota.guard";
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
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrossDto, @Req() req: CrossReservedRequest) {
    const tier = await this.tier.resolve(user.id, user.tier);
    // QuotaGuard já reservou 1 cruzamento (QuotaService.reserve, atômico) e
    // deixou o id da reserva em req.crossReservationId. Sucesso → confirma
    // (a reserva vira permanente); falha → estorna (apaga a reserva) — a
    // cota do usuário não pode cair por uma tentativa que não gerou
    // espécime algum. Sem sucesso, não há débito extra: a reserva JÁ É o débito.
    const reservationId = req.crossReservationId!;
    try {
      const result = await this.service.execute(user.id, tier, dto);
      await this.quota.confirm(reservationId);
      return result;
    } catch (e) {
      await this.quota.release(reservationId);
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
