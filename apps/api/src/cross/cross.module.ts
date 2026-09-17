import { Module } from "@nestjs/common";
import { EconomyModule } from "../economy/economy.module";
import { TierModule } from "../billing/tier.module";
import { SpecimensModule } from "../specimens/specimens.module";
import { ImageModule } from "../images/image.module";
import { QuotaModule } from "../quota/quota.module";
import { IncubatorStoreModule } from "../incubator/incubator-store.module";
import { CrossController } from "./cross.controller";
import { SpecimensController } from "../specimens/specimens.controller";
import { CrossService } from "./cross.service";

/**
 * `SpecimenRepository` agora vem de `SpecimensModule` (não mais provido
 * aqui) — ver o comentário desse módulo sobre o ciclo que isso evitava.
 * `ImageModule` continua importado aqui porque `CrossService` precisa de
 * `ImageService` — não mais pro retrato incluído do cruzamento (ADR-0019,
 * removido pela ADR-0020: cruzar não cria espécime nenhum mais, então não
 * há mais "retrato incluído no cruzamento" — o retrato passa a ser pago na
 * REVELAÇÃO, ver `IncubatorModule`); `CrossService` ainda usa `ImageService`
 * indiretamente via `execute()` (mantido, usado por `GeneBankService.
 * synthesizeAndFreeze` — ver ADR-0020 "órfãos").
 * `QuotaModule` — `QuotaGuard` (agora só o limite TÉCNICO horário, ADR-0020,
 * não mais a cota de cruzamento por tier — essa virou `revealQuota`,
 * cobrada em `IncubatorModule`).
 * `IncubatorStoreModule` (NOVO, ADR-0020) — `CrossController` grava as
 * descrições enumeradas por `CrossService.incubate()` como linhas de
 * `incubator_entries`; é um módulo-FOLHA (só `IncubatorRepository`, sem
 * importar nada), então importar aqui não cria ciclo com `IncubatorModule`
 * (que tem o resto da feature — revelar/nascer/congelar — e não precisa de
 * `CrossModule` pra nada).
 */
@Module({
  imports: [EconomyModule, TierModule, SpecimensModule, ImageModule, QuotaModule, IncubatorStoreModule],
  controllers: [CrossController, SpecimensController],
  providers: [CrossService],
  // Reexporta TierModule/SpecimensModule/QuotaModule: GeneBankModule/
  // GenomeModule já importam CrossModule (por causa de SpecimenRepository/
  // TierService/QuotaService) e ganham os três de graça, sem precisar mudar
  // o import deles.
  exports: [SpecimensModule, QuotaModule, CrossService, TierModule],
})
export class CrossModule {}
