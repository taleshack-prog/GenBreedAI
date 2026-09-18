import { Module } from "@nestjs/common";
import { PublicSpecimenController } from "./public-specimen.controller";
import { SpecimensModule } from "./specimens.module";

/** Compartilhamento viral (`/f/[id]` na web) — só o repositório de espécimes, módulo-folha, sem ciclo. */
@Module({
  imports: [SpecimensModule],
  controllers: [PublicSpecimenController],
})
export class PublicSpecimenModule {}
