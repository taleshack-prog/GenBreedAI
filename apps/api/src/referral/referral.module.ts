import { Module } from "@nestjs/common";
import { ReferralController } from "./referral.controller";
import { ReferralService } from "./referral.service";
import { EconomyModule } from "../economy/economy.module";
import { TierModule } from "../billing/tier.module";
import { ClockModule } from "../common/clock.module";

/**
 * `ReferralService` é consumido por `AuthModule` (marco "cadastrou", no
 * registro) e `BillingModule` (marco "converteu", no webhook do Stripe) —
 * ambos importam este módulo; ele não importa nenhum dos dois (sem ciclo).
 * `TierModule` fornece `TierService`/`GrantedTiersRepository` (recompensa PHD
 * via `granted_tiers`); `ClockModule`, o `Clock` (expiração de 30 dias).
 */
@Module({
  imports: [EconomyModule, TierModule, ClockModule],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
