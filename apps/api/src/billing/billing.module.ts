import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { EconomyModule } from "../economy/economy.module";
import { PaymentIntentsRepository, InMemoryPaymentIntentsRepository, DrizzlePaymentIntentsRepository } from "./payment-intents.repository";
import { createDb } from "../db/client";

const paymentIntentsRepositoryProvider = {
  provide: PaymentIntentsRepository,
  useFactory: (): PaymentIntentsRepository => {
    const url = process.env.DATABASE_URL;
    if (url && url.length > 0) { const { db } = createDb(url); return new DrizzlePaymentIntentsRepository(db); }
    return new InMemoryPaymentIntentsRepository();
  },
};

@Module({ imports: [EconomyModule], controllers: [BillingController], providers: [BillingService, paymentIntentsRepositoryProvider] })
export class BillingModule {}
