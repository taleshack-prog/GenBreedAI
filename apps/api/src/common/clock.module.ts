import { Module } from "@nestjs/common";
import { Clock, SystemClock } from "./clock";

/**
 * Módulo-folha (mesmo padrão de `QuotaModule`/`IncubatorStoreModule`) — só
 * fornece `Clock`/`SystemClock`, não importa nada, evitando qualquer ciclo.
 * `useExisting` garante que `Clock` (token usado por quem injeta a
 * dependência) e `SystemClock` (classe concreta, usada por testes e2e via
 * `app.get(SystemClock)` para chamar `setForTesting()`) resolvem pra
 * EXATAMENTE a mesma instância singleton — senão um teste que avança
 * `SystemClock` não afetaria o `Clock` que os services de fato usam.
 */
@Module({
  providers: [SystemClock, { provide: Clock, useExisting: SystemClock }],
  exports: [Clock, SystemClock],
})
export class ClockModule {}
