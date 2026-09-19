import { Module } from "@nestjs/common";
import { ClockModule } from "../common/clock.module";
import { createDb } from "../db/client";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { PushSender, WebPushSender } from "./push-sender";
import { PushSubscriptionRepository, InMemoryPushSubscriptionRepository, DrizzlePushSubscriptionRepository } from "./push-subscription.repository";

/**
 * Web Push (ADR-0028). Módulo-folha (só importa `ClockModule`): repositório escolhido por
 * `DATABASE_URL` (Drizzle/in-memory, como os demais) e `PushSender` = `WebPushSender` (a
 * biblioteca `web-push` só é carregada no primeiro envio — sem ela, o app sobe normal).
 * `AuthGuard` vem do `AuthModule` (@Global).
 */
const pushRepositoryProvider = {
  provide: PushSubscriptionRepository,
  useFactory: (): PushSubscriptionRepository => {
    const url = process.env.DATABASE_URL;
    if (url && url.length > 0) return new DrizzlePushSubscriptionRepository(createDb(url).db);
    return new InMemoryPushSubscriptionRepository();
  },
};

@Module({
  imports: [ClockModule],
  controllers: [PushController],
  providers: [pushRepositoryProvider, { provide: PushSender, useFactory: () => new WebPushSender() }, PushService],
  exports: [PushService, PushSubscriptionRepository],
})
export class PushModule {}
