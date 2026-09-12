import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { BillingService } from "./billing.service";

@Controller("api/v1/billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("packs")
  packs() { return this.billing.packs(); }

  @Post("checkout")
  @UseGuards(AuthGuard)
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() body: { packId: string }) {
    return this.billing.createCheckout(user.id, body.packId);
  }

  @Post("confirm")
  @UseGuards(AuthGuard)
  confirm(@CurrentUser() user: AuthenticatedUser, @Body() body: { intentId: string }) {
    return this.billing.confirm(user.id, body.intentId);
  }
}
