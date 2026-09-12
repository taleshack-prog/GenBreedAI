import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { EconomyModule } from "../economy/economy.module";

@Module({ imports: [EconomyModule], controllers: [BillingController], providers: [BillingService] })
export class BillingModule {}
