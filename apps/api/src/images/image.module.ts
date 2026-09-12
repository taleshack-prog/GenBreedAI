import { Module } from "@nestjs/common";
import { ImageController, ImageQuotaController } from "./image.controller";
import { PreviewController } from "./preview.controller";
import { ImageService } from "./image.service";
import { ImageJobRepository } from "./image-job.repository";
import { ImageQuotaService } from "../economy/image-quota.service";
import { EconomyModule } from "../economy/economy.module";
import { CrossModule } from "../cross/cross.module";

@Module({
  imports: [EconomyModule, CrossModule], // fornece SpecimenRepository
  controllers: [ImageController, ImageQuotaController, PreviewController],
  providers: [ImageService, ImageJobRepository, ImageQuotaService],
})
export class ImageModule {}
