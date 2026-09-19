import { Module } from "@nestjs/common";
import { ImageController, ImageQuotaController } from "./image.controller";
import { ImageService } from "./image.service";
import { ImageJobRepository } from "./image-job.repository";
import { ImageQuotaService } from "../economy/image-quota.service";
import { EconomyModule } from "../economy/economy.module";
import { SpecimensModule } from "../specimens/specimens.module";
import { TierModule } from "../billing/tier.module";
import { ClockModule } from "../common/clock.module";

/**
 * `PreviewController` (`POST /api/v1/cross/preview`, antes hospedado em
 * `CrossModule`) foi REMOVIDO (ADR-0019): nenhuma prévia de fenótipo gera
 * imagem mais — o retrato só nasce ao sintetizar o fenótipo escolhido, já
 * incluído no cruzamento. Este módulo continua sem importar `CrossModule`
 * (`SpecimenRepository` vem de `SpecimensModule`; `ImageService` é
 * exportado pra `CrossModule` poder injetá-lo em `CrossService`, que
 * dispara esse retrato incluído) — evita o ciclo `ImageModule` ⇄
 * `CrossModule` mesmo sem o motivo original do preview.
 *
 * `TierModule`: `ImageController`/`ImageQuotaController` resolvem o tier
 * efetivo via `TierService.resolve()` (nunca do JWT cru) — faltava esse
 * import (bug de produção: "Nest can't resolve dependencies of the
 * ImageController (ImageService, ?)"). `TierModule` só importa `QuotaModule`
 * (que não importa nada) — sem ciclo: nem `TierModule` nem `QuotaModule`
 * importam `ImageModule` ou `CrossModule` de volta.
 */
@Module({
  imports: [EconomyModule, SpecimensModule, TierModule, ClockModule], // ClockModule: `ImageQuotaService` lê o mês da cota de `Clock`
  controllers: [ImageController, ImageQuotaController],
  providers: [ImageService, ImageJobRepository, ImageQuotaService],
  exports: [ImageService],
})
export class ImageModule {}
