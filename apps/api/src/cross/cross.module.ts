import { Module } from "@nestjs/common";
import { CrossController } from "./cross.controller";
import { SpecimensController } from "../specimens/specimens.controller";
import { CrossService } from "./cross.service";
import { QuotaService } from "../quota/quota.service";
import {
  SpecimenRepository,
  InMemorySpecimenRepository,
} from "../specimens/in-memory.repository";
import { DrizzleSpecimenRepository } from "../specimens/drizzle.repository";
import { createDb } from "../db/client";

/**
 * Seleção de adapter de persistência:
 *  - DATABASE_URL definido  → DrizzleSpecimenRepository (Postgres/Neon)
 *  - caso contrário          → InMemorySpecimenRepository (dev/testes sem DB)
 * O serviço e o controller não mudam — trocamos apenas o provider (ADR-0005/0006).
 */
const specimenRepositoryProvider = {
  provide: SpecimenRepository,
  useFactory: (): SpecimenRepository => {
    const url = process.env.DATABASE_URL;
    if (url && url.length > 0) {
      const { db } = createDb(url);
      return new DrizzleSpecimenRepository(db);
    }
    return new InMemorySpecimenRepository();
  },
};

@Module({
  controllers: [CrossController, SpecimensController],
  providers: [CrossService, QuotaService, specimenRepositoryProvider],
  exports: [SpecimenRepository, QuotaService],
})
export class CrossModule {}
