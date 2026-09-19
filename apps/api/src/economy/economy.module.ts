import { Module } from "@nestjs/common";
import { WalletService } from "./wallet.service";
import { WalletRepository, InMemoryWalletRepository, DrizzleWalletRepository } from "./wallet.repository";
import { createDb } from "../db/client";
import { ClockModule } from "../common/clock.module";

const walletRepositoryProvider = {
  provide: WalletRepository,
  useFactory: (): WalletRepository => {
    const url = process.env.DATABASE_URL;
    if (url && url.length > 0) { const { db } = createDb(url); return new DrizzleWalletRepository(db); }
    return new InMemoryWalletRepository();
  },
};

// `ClockModule` (módulo-folha): `WalletService` lê "agora" de `Clock` (dia do bônus diário, janela de 15 dias do quinzenal).
@Module({ imports: [ClockModule], providers: [WalletService, walletRepositoryProvider], exports: [WalletService] })
export class EconomyModule {}
