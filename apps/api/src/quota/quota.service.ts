/**
 * Contador de cota diária de cruzamentos por usuário (TDD §6 / §8: 429 Too Many
 * Requests). Implementação in-memory com janela por dia (UTC).
 *
 * SEAM: em produção, o backing store é Redis Token Bucket (TDD §2/§7.1). A
 * interface pública (`tryConsume`, `remaining`) não muda.
 */

import { Injectable } from "@nestjs/common";

interface Counter {
  day: string; // AAAA-MM-DD (UTC)
  count: number;
}

@Injectable()
export class QuotaService {
  private readonly counters = new Map<string, Counter>();

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private get(userId: string): Counter {
    const day = this.today();
    const c = this.counters.get(userId);
    if (!c || c.day !== day) {
      const fresh: Counter = { day, count: 0 };
      this.counters.set(userId, fresh);
      return fresh;
    }
    return c;
  }

  /** Cruzamentos restantes hoje para o usuário, dado seu limite diário. */
  remaining(userId: string, dailyLimit: number): number {
    if (process.env.CROSS_QUOTA_UNLIMITED === "true") return 9999;
    return Math.max(0, dailyLimit - this.get(userId).count);
  }

  /**
   * Tenta consumir 1 cruzamento. Retorna true se havia cota; false caso contrário.
   * NÃO é chamado pelo motor — é um gate de acesso, não um parâmetro genético.
   */
  tryConsume(userId: string, dailyLimit: number): boolean {
    if (process.env.CROSS_QUOTA_UNLIMITED === "true") return true; // modo DEV
    const c = this.get(userId);
    if (c.count >= dailyLimit) return false;
    c.count += 1;
    return true;
  }

  /**
   * Estorna 1 cruzamento reservado por `tryConsume` (ex.: falha após a
   * reserva do QuotaGuard — ver CrossController). Só decrementa se existir
   * um contador para o usuário, do dia atual, com count > 0; caso contrário
   * não faz nada (nunca fica negativo, nunca cria contador novo). No-op se
   * CROSS_QUOTA_UNLIMITED === "true" (nada foi de fato reservado nesse modo).
   */
  release(userId: string): void {
    if (process.env.CROSS_QUOTA_UNLIMITED === "true") return;
    const c = this.counters.get(userId);
    if (!c || c.day !== this.today() || c.count <= 0) return;
    c.count -= 1;
  }

  /** Uso apenas em testes: zera todos os contadores. */
  resetAll(): void {
    this.counters.clear();
  }
}
