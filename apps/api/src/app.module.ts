import { Module } from "@nestjs/common";
import { CrossModule } from "./cross/cross.module";
import { ImageModule } from "./images/image.module";

@Module({ imports: [CrossModule, ImageModule] })
export class AppModule {}
