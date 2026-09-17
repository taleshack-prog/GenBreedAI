import { Module } from "@nestjs/common";
import { SpecimenRepository, InMemorySpecimenRepository } from "./in-memory.repository";
import { DrizzleSpecimenRepository } from "./drizzle.repository";
import { createDb } from "../db/client";

/**
 * Seleção de adapter de persistência (ADR-0005/0006):
 *  - DATABASE_URL definido  → DrizzleSpecimenRepository (Postgres/Neon)
 *  - caso contrário          → InMemorySpecimenRepository (dev/testes sem DB)
 *
 * Extraído de cross.module.ts pra `ImageModule` e `CrossModule` dependerem
 * SÓ deste módulo (nunca um do outro) — `CrossService` passou a precisar de
 * `ImageService` (retrato incluído no cruzamento, ADR-0019), e `ImageModule`
 * já precisava de `SpecimenRepository`; se `ImageModule` continuasse
 * importando `CrossModule` pra isso, os dois módulos formariam um ciclo.
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
  providers: [specimenRepositoryProvider],
  exports: [SpecimenRepository],
})
export class SpecimensModule {}
