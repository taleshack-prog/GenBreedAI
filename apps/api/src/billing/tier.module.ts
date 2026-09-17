import { Module } from "@nestjs/common";
import { createDb } from "../db/client";
import { SubscriptionsRepository, InMemorySubscriptionsRepository, DrizzleSubscriptionsRepository } from "./subscriptions.repository";
import { GrantedTiersRepository, InMemoryGrantedTiersRepository, DrizzleGrantedTiersRepository } from "./granted-tiers.repository";
import { TierService } from "./tier.service";
import { MeController } from "./me.controller";
import { QuotaModule } from "../quota/quota.module";

const subscriptionsRepositoryProvider = {
  provide: SubscriptionsRepository,
  useFactory: (): SubscriptionsRepository => {
    const url = process.env.DATABASE_URL;
    if (url && url.length > 0) { const { db } = createDb(url); return new DrizzleSubscriptionsRepository(db); }
    return new InMemorySubscriptionsRepository();
  },
};

const grantedTiersRepositoryProvider = {
  provide: GrantedTiersRepository,
  useFactory: (): GrantedTiersRepository => {
    const url = process.env.DATABASE_URL;
    if (url && url.length > 0) { const { db } = createDb(url); return new DrizzleGrantedTiersRepository(db); }
    return new InMemoryGrantedTiersRepository();
  },
};

/**
 * Módulo pequeno e sem dependência de Stripe — só resolução de tier (leitura
 * de subscriptions/granted_tiers). BillingModule importa pra escrever essas
 * tabelas (webhook, subscribe); CrossModule importa e reexporta TierService
 * pra todo módulo que já depende de CrossModule (Image/GeneBank/Genome)
 * ganhar acesso sem import extra.
 */
@Module({
  imports: [QuotaModule], // MeController usa QuotaService pra devolver revealQuota (ADR-0020)
  controllers: [MeController],
  providers: [TierService, subscriptionsRepositoryProvider, grantedTiersRepositoryProvider],
  exports: [TierService, SubscriptionsRepository, GrantedTiersRepository],
})
export class TierModule {}
