/**
 * Fonte de tempo injetável (bugfix da rodada de gestação, ADR-0021) — usada
 * em vez de `new Date()`/`Date.now()` direto em qualquer cálculo de janela
 * de tempo que precise ser testável sem esperar tempo real: prazo de
 * gestação (`IncubatorService.gestate`/`born`) e janela de cota
 * (`QuotaService`).
 *
 * Produção: `SystemClock.now()` sempre devolve o relógio real — mesmo
 * comportamento de antes, byte a byte (`new Date()`).
 *
 * Testes: `SystemClock.setForTesting(data)` força um instante fixo SEM usar
 * `vi.useFakeTimers()` global. Isso importa porque `vi.useFakeTimers()`
 * também fake `setImmediate`/timers internos do Fastify — combinado com
 * `app.inject()` (testes e2e via HTTP), a resposta simulada nunca resolve e
 * o teste trava até o timeout (5s), era exatamente a causa dos 4 testes com
 * "Test timed out" em `incubator.e2e.spec.ts`. `Clock` deixa o relógio da
 * REGRA DE NEGÓCIO controlável sem tocar nos timers do runtime.
 */
import { Injectable } from "@nestjs/common";

export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  private overrideTime: Date | null = null;

  now(): Date {
    return this.overrideTime ? new Date(this.overrideTime.getTime()) : new Date();
  }

  /**
   * SÓ testes: força `now()` a devolver sempre este instante (`null` volta
   * ao relógio real). Nenhum caminho de produção chama isto — a instância
   * de `SystemClock` é a mesma injetada como `Clock` em todo o app
   * (`ClockModule` usa `useExisting`), então um teste e2e pode pegar a
   * instância via `app.get(SystemClock)` e avançar o tempo da REGRA sem
   * mexer em timers globais.
   */
  setForTesting(t: Date | null): void {
    this.overrideTime = t;
  }
}
