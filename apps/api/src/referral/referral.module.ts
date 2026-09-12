import { Module } from "@nestjs/common";
import { ReferralController } from "./referral.controller";
import { ReferralService } from "./referral.service";
import { EconomyModule } from "../economy/economy.module";

@Module({ imports: [EconomyModule], controllers: [ReferralController], providers: [ReferralService] })
export class ReferralModule {}
