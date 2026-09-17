import { Module } from "@nestjs/common";
import { IncubatorStoreModule } from "./incubator-store.module";
import { IncubatorService } from "./incubator.service";
import { IncubatorController } from "./incubator.controller";
import { EconomyModule } from "../economy/economy.module";
import { ImageModule } from "../images/image.module";
import { QuotaModule } from "../quota/quota.module";
import { SpecimensModule } from "../specimens/specimens.module";
import { TierModule } from "../billing/tier.module";

/**
 * Feature da incubadora (ADR-0020): revelar/nascer/congelar/descartar/listar.
 * NÃO importa `CrossModule` — a orquestração "cruzar → gera as entradas da
 * incubadora" mora em `CrossController` (`CrossModule`, que importa
 * `IncubatorStoreModule` direto), evitando o ciclo `CrossModule` ⇄
 * `IncubatorModule` que importar `CrossModule` aqui formaria (`CrossModule`
 * precisaria de volta deste módulo por `IncubatorService`, que ninguém usa
 * lá). `ImageModule` — gera o retrato na revelação. `SpecimensModule` —
 * persiste o espécime ao nascer. `QuotaModule` — cota de revelação.
 * `EconomyModule` — crédito de imagem (fallback) e custo de congelar.
 * `TierModule` — resolve o tier efetivo (nunca do JWT cru).
 */
@Module({
  imports: [IncubatorStoreModule, ImageModule, SpecimensModule, QuotaModule, EconomyModule, TierModule],
  controllers: [IncubatorController],
  providers: [IncubatorService],
})
export class IncubatorModule {}
