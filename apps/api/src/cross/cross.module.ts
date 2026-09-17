import { Module } from "@nestjs/common";
import { EconomyModule } from "../economy/economy.module";
import { TierModule } from "../billing/tier.module";
import { SpecimensModule } from "../specimens/specimens.module";
import { ImageModule } from "../images/image.module";
import { QuotaModule } from "../quota/quota.module";
import { CrossController } from "./cross.controller";
import { SpecimensController } from "../specimens/specimens.controller";
import { CrossService } from "./cross.service";

/**
 * `SpecimenRepository` agora vem de `SpecimensModule` (não mais provido
 * aqui) — ver o comentário desse módulo sobre o ciclo que isso evitava.
 * `ImageModule` continua importado aqui porque `CrossService` precisa de
 * `ImageService` (retrato incluído no cruzamento, ADR-0019) — não mais por
 * causa de `PreviewController` (rota `POST /api/v1/cross/preview`), que foi
 * REMOVIDA: nenhuma prévia de fenótipo gera imagem mais (ADR-0019 — um PhD
 * abrindo 12 opções consumia a cota mensal em 2 cruzamentos); o retrato só
 * nasce ao sintetizar o fenótipo escolhido, já incluído no cruzamento.
 * `QuotaService` mudou pra `QuotaModule` (mesmo motivo: `TierModule` também
 * precisa dele, em `MeController`, e importar `CrossModule` de dentro de
 * `TierModule` seria outro ciclo).
 */
@Module({
  imports: [EconomyModule, TierModule, SpecimensModule, ImageModule, QuotaModule],
  controllers: [CrossController, SpecimensController],
  providers: [CrossService],
  // Reexporta TierModule/SpecimensModule/QuotaModule: GeneBankModule/
  // GenomeModule já importam CrossModule (por causa de SpecimenRepository/
  // TierService/QuotaService) e ganham os três de graça, sem precisar mudar
  // o import deles.
  exports: [SpecimensModule, QuotaModule, CrossService, TierModule],
})
export class CrossModule {}
