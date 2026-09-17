import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { TierService } from "../billing/tier.service";
import { tierPolicy } from "../common/tiers";
import { GeneBankService } from "./gene-bank.service";
import { WalletService } from "../economy/wallet.service";
import type { CrossDto } from "../cross/dto/cross.dto";

interface SynthesizeDto extends CrossDto { freezeKeys?: string[]; }

@Controller("api/v1")
export class GeneBankController {
  constructor(private readonly gb: GeneBankService, private readonly wallet: WalletService, private readonly tier: TierService) {}

  @Get("wallet")
  @UseGuards(AuthGuard)
  getWallet(@CurrentUser() user: AuthenticatedUser) { return this.wallet.get(user.id); }

  @Post("wallet/daily")
  @UseGuards(AuthGuard)
  async claimDaily(@CurrentUser() user: AuthenticatedUser) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.wallet.claimDaily(user.id, tier);
  }

  /** ADR-0019: bônus semanal só a partir do Junior (FREE não tem). */
  @Post("wallet/weekly")
  @UseGuards(AuthGuard)
  async claimWeekly(@CurrentUser() user: AuthenticatedUser) {
    const tier = await this.tier.resolve(user.id, user.tier);
    if (!tierPolicy(tier).weeklyBonus) {
      throw new ForbiddenException("Bônus semanal disponível a partir do plano Junior.");
    }
    return this.wallet.claimWeekly(user.id);
  }

  @Post("gene-bank/freeze/:id")
  @UseGuards(AuthGuard)
  async freeze(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.gb.freezeSpecimen(user.id, tier, id);
  }

  @Post("gene-bank/thaw/:id")
  @UseGuards(AuthGuard)
  async thaw(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.gb.thaw(user.id, tier, id);
  }

  /** Sintetiza o escolhido e congela os demais (fluxo pedido). */
  @Post("gene-bank/synthesize")
  @UseGuards(AuthGuard)
  async synthesize(@CurrentUser() user: AuthenticatedUser, @Body() dto: SynthesizeDto) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.gb.synthesizeAndFreeze(user.id, tier, dto, dto.freezeKeys ?? []);
  }
}
