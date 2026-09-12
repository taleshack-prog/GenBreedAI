import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { GeneBankService } from "./gene-bank.service";
import { WalletService } from "../economy/wallet.service";
import type { CrossDto } from "../cross/dto/cross.dto";

interface SynthesizeDto extends CrossDto { freezeKeys?: string[]; }

@Controller("api/v1")
export class GeneBankController {
  constructor(private readonly gb: GeneBankService, private readonly wallet: WalletService) {}

  @Get("wallet")
  @UseGuards(AuthGuard)
  getWallet(@CurrentUser() user: AuthenticatedUser) { return this.wallet.get(user.id); }

  @Post("wallet/daily")
  @UseGuards(AuthGuard)
  claimDaily(@CurrentUser() user: AuthenticatedUser) { return this.wallet.claimDaily(user.id, user.tier); }

  @Post("wallet/weekly")
  @UseGuards(AuthGuard)
  claimWeekly(@CurrentUser() user: AuthenticatedUser) { return this.wallet.claimWeekly(user.id); }

  @Post("gene-bank/freeze-option")
  @UseGuards(AuthGuard)
  freezeOption(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrossDto) {
    return this.gb.freezeOption(user.id, user.tier, dto);
  }

  @Post("gene-bank/freeze/:id")
  @UseGuards(AuthGuard)
  freeze(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.gb.freezeSpecimen(user.id, id);
  }

  @Post("gene-bank/thaw/:id")
  @UseGuards(AuthGuard)
  thaw(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.gb.thaw(user.id, id);
  }

  /** Sintetiza o escolhido e congela os demais (fluxo pedido). */
  @Post("gene-bank/synthesize")
  @UseGuards(AuthGuard)
  synthesize(@CurrentUser() user: AuthenticatedUser, @Body() dto: SynthesizeDto) {
    return this.gb.synthesizeAndFreeze(user.id, user.tier, dto, dto.freezeKeys ?? []);
  }
}
