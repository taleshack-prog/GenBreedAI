import { Module } from "@nestjs/common";
import { ClockModule } from "../common/clock.module";
import { createDb } from "../db/client";
import { HealthController } from "./health.controller";
import { DEFAULT_HEALTH_OPTIONS, HEALTH_OPTIONS, HealthService } from "./health.service";
import { HealthDataRepository, InMemoryHealthDataRepository } from "./health-data.repository";
import { DrizzleHealthDataRepository } from "./health-data.drizzle";
import { DefaultHealthProbes, HealthProbes } from "./health-probes";

/**
 * Health check central (ADR-0039). Módulo-folha (só importa `ClockModule`, como `PushModule`): repositório escolhido por `DATABASE_URL` (Drizzle /
 * in-memory), sondas externas reais e as opções padrão (timeout 2s, cache 30s).
 */
const healthDataProvider = {
  provide: HealthDataRepository,
  useFactory: (): HealthDataRepository => {
    const url = process.env.DATABASE_URL;
    if (url && url.length > 0) return new DrizzleHealthDataRepository(createDb(url).db);
    return new InMemoryHealthDataRepository();
  },
};

@Module({
  imports: [ClockModule],
  controllers: [HealthController],
  providers: [
    healthDataProvider,
    { provide: HealthProbes, useFactory: () => new DefaultHealthProbes() },
    { provide: HEALTH_OPTIONS, useValue: DEFAULT_HEALTH_OPTIONS },
    HealthService,
  ],
})
export class HealthModule {}
