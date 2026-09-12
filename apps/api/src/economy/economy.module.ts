import { Module } from "@nestjs/common";
import { WalletService } from "./wallet.service";
import { WalletRepository, InMemoryWalletRepository, DrizzleWalletRepository } from "./wallet.repository";
import { createDb } from "../db/client";

const walletRepositoryProvider = {
  provide: WalletRepository,
  useFactory: (): WalletRepository => {
    const url = process.env.DATABASE_URL;
    if (url && url.length > 0) { const { db } = createDb(url); return new DrizzleWalletRepository(db); }
    return new InMemoryWalletRepository();
  },
};

@Module({ providers: [WalletService, walletRepositoryProvider], exports: [WalletService] })
export class EconomyModule {}
