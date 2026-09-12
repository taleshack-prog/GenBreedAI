import { Module } from "@nestjs/common";
import { GenomeController } from "./genome.controller";
import { GenomeService } from "./genome.service";
import { CrossModule } from "../cross/cross.module";

@Module({ imports: [CrossModule], controllers: [GenomeController], providers: [GenomeService] })
export class GenomeModule {}
