import { Module } from "@nestjs/common";
import { QuotaService } from "./quota.service";

/**
 * Extraído de `CrossModule` (ADR-0019) pra `TierModule` também conseguir
 * `QuotaService` sem importar `CrossModule` — `TierModule` já é importado
 * por `CrossModule`, então o caminho inverso formaria um ciclo. `MeController`
 * (em `TierModule`) usa `QuotaService` pra devolver `revealQuota` (ADR-0020)
 * em GET /api/v1/me/tier. `IncubatorModule` (rota de revelar) também
 * importa este módulo direto (sem ciclo — `QuotaModule` não importa nada).
 */
@Module({
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
