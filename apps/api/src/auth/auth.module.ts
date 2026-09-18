import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { UserRepository, InMemoryUserRepository, DrizzleUserRepository } from "./user.repository";
import { createDb } from "../db/client";
import { ReferralModule } from "../referral/referral.module";

const userRepositoryProvider = {
  provide: UserRepository,
  useFactory: (): UserRepository => {
    const url = process.env.DATABASE_URL;
    if (url && url.length > 0) return new DrizzleUserRepository(createDb(url).db);
    return new InMemoryUserRepository();
  },
};

// Global: AuthService fica disponível ao AuthGuard em qualquer módulo.
// `ReferralModule` (ADR-0024): o registro credita o marco "cadastrou" da indicação.
@Global()
@Module({ imports: [ReferralModule], controllers: [AuthController], providers: [AuthService, userRepositoryProvider], exports: [AuthService] })
export class AuthModule {}
