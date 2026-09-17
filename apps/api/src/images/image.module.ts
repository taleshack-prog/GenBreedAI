import { Module } from "@nestjs/common";
import { ImageController, ImageQuotaController } from "./image.controller";
import { ImageService } from "./image.service";
import { ImageJobRepository } from "./image-job.repository";
import { ImageQuotaService } from "../economy/image-quota.service";
import { EconomyModule } from "../economy/economy.module";
import { SpecimensModule } from "../specimens/specimens.module";
import { TierModule } from "../billing/tier.module";

/**
 * `PreviewController` (`/cross/preview`) mudou pra `CrossModule` — ele
 * depende de `CrossService`, e este módulo depende de `ImageService`
 * (`CrossService.execute()` dispara o retrato incluído, ADR-0019); manter
 * o preview aqui formaria um ciclo `ImageModule` ⇄ `CrossModule`.
 * `SpecimenRepository` vem de `SpecimensModule` (nunca mais de `CrossModule`
 * diretamente) pelo mesmo motivo. `ImageService` é exportado pra
 * `CrossModule` poder injetá-lo em `CrossService`.
 *
 * `TierModule`: `ImageController`/`ImageQuotaController` resolvem o tier
 * efetivo via `TierService.resolve()` (nunca do JWT cru) — faltava esse
 * import (bug de produção: "Nest can't resolve dependencies of the
 * ImageController (ImageService, ?)"). `TierModule` só importa `QuotaModule`
 * (que não importa nada) — sem ciclo: nem `TierModule` nem `QuotaModule`
 * importam `ImageModule` ou `CrossModule` de volta.
 */
@Module({
  imports: [EconomyModule, SpecimensModule, TierModule],
  controllers: [ImageController, ImageQuotaController],
  providers: [ImageService, ImageJobRepository, ImageQuotaService],
  exports: [ImageService],
})
export class ImageModule {}
