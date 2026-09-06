import { Module } from "@nestjs/common";
import { CrossModule } from "./cross/cross.module";

@Module({ imports: [CrossModule] })
export class AppModule {}
