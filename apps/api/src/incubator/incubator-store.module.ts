import { Module } from "@nestjs/common";
import { IncubatorRepository, InMemoryIncubatorRepository } from "./in-memory.repository";
import { DrizzleIncubatorRepository } from "./drizzle.repository";
import { createDb } from "../db/client";

/**
 * Módulo-FOLHA (mesmo padrão de `specimens/specimens.module.ts`): só provê
 * `IncubatorRepository` (seleção Drizzle/in-memory por DATABASE_URL, ADR-0005/
 * 0006), sem importar nada — extraído do resto da feature (`incubator.module.ts`,
 * controller+service de revelar/nascer/congelar/descartar) pra `CrossModule`
 * poder persistir as entradas da incubadora (POST /cross, ADR-0020) SEM
 * importar `IncubatorModule` (que precisaria de `CrossService` pra nada — a
 * orquestração "cruzar → incubadora" mora em `CrossController`, não aqui) —
 * evita um ciclo `CrossModule` ⇄ `IncubatorModule`.
 */
const incubatorRepositoryProvider = {
  provide: IncubatorRepository,
  useFactory: (): IncubatorRepository => {
    const url = process.env.DATABASE_URL;
    if (url && url.length > 0) {
      const { db } = createDb(url);
      return new DrizzleIncubatorRepository(db);
    }
    return new InMemoryIncubatorRepository();
  },
};

@Module({
  providers: [incubatorRepositoryProvider],
  exports: [IncubatorRepository],
})
export class IncubatorStoreModule {}
