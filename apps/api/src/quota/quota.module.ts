import { Module } from "@nestjs/common";
import { QuotaService } from "./quota.service";
import { ClockModule } from "../common/clock.module";

/**
 * Extraído de `CrossModule` (ADR-0019) pra `TierModule` também conseguir
 * `QuotaService` sem importar `CrossModule` — `TierModule` já é importado
 * por `CrossModule`, então o caminho inverso formaria um ciclo. `MeController`
 * (em `TierModule`) usa `QuotaService` pra devolver `birthQuota` (ADR-0021)
 * em GET /api/v1/me/tier. `IncubatorModule` (rota de gestar) também
 * importa este módulo direto (sem ciclo — só `ClockModule`, que não importa
 * nada). `ClockModule` fornece `Clock` (bugfix: `QuotaService` não usa mais
 * `new Date()` direto, ver `common/clock.ts`).
 */
@Module({
  imports: [ClockModule],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
