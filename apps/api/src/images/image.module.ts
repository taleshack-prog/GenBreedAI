import { Module } from "@nestjs/common";
import { ImageController } from "./image.controller";
import { ImageService } from "./image.service";
import { ImageJobRepository } from "./image-job.repository";
import { CrossModule } from "../cross/cross.module";

@Module({
  imports: [CrossModule], // fornece SpecimenRepository
  controllers: [ImageController],
  providers: [ImageService, ImageJobRepository],
})
export class ImageModule {}
