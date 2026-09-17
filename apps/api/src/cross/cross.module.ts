import { Module } from "@nestjs/common";
import { EconomyModule } from "../economy/economy.module";
import { TierModule } from "../billing/tier.module";
import { SpecimensModule } from "../specimens/specimens.module";
import { ImageModule } from "../images/image.module";
import { QuotaModule } from "../quota/quota.module";
import { CrossController } from "./cross.controller";
import { SpecimensController } from "../specimens/specimens.controller";
import { PreviewController } from "../images/preview.controller";
import { CrossService } from "./cross.service";

/**
 * `SpecimenRepository` agora vem de `SpecimensModule` (não mais provido
 * aqui) — ver o comentário desse módulo sobre o ciclo que isso evitava.
 * `PreviewController` (rota `/cross/preview`) mudou de `ImageModule` pra cá:
 * ele já dependia de `CrossService`; ficar em `CrossModule` (que agora
 * também importa `ImageModule` pra ganhar `ImageService`) evita o mesmo
 * ciclo pelo lado do preview. `QuotaService` mudou pra `QuotaModule` (mesmo
 * motivo: `TierModule` também precisa dele, em `MeController`, e importar
 * `CrossModule` de dentro de `TierModule` seria outro ciclo).
 */
@Module({
  imports: [EconomyModule, TierModule, SpecimensModule, ImageModule, QuotaModule],
  controllers: [CrossController, SpecimensController, PreviewController],
  providers: [CrossService],
  // Reexporta TierModule/SpecimensModule/QuotaModule: GeneBankModule/
  // GenomeModule já importam CrossModule (por causa de SpecimenRepository/
  // TierService/QuotaService) e ganham os três de graça, sem precisar mudar
  // o import deles.
  exports: [SpecimensModule, QuotaModule, CrossService, TierModule],
})
export class CrossModule {}
