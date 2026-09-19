/**
 * Economia (TDD §7): carteira persistida. Catalisadores (congelar) + Biomassa (descongelar) + créditos de imagem.
 *
 * REGRA (ADR-0029): todo ajuste de saldo é UM comando atômico no repositório (`UPDATE ... RETURNING`,
 * condição no próprio `WHERE`) — nunca `get` seguido de `save`. Ler e gravar em dois passos deixava dois
 * pedidos simultâneos lerem o mesmo saldo (crédito perdido, gasto em dobro, bônus coletado duas vezes) e o
 * `save` regravava a carteira INTEIRA, apagando créditos comprados e janelas do bônus.
 */
import { BadRequestException, Injectable } from "@nestjs/common";
import { WalletRepository, type Wallet } from "./wallet.repository";
import { Clock, SystemClock } from "../common/clock";
import { saoPauloDate } from "../common/sao-paulo-time";

export type { Wallet };
export const FREEZE_COST = { catalisadores: 20 };
export const THAW_COST = { biomassa: 10000 };
/** Janela do bônus de crédito (1 crédito = 1 nascimento extra; ADR-0021 — 15 dias corridos, era 7/semanal na ADR-0019). */
const BIWEEKLY_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

@Injectable()
export class WalletService {
  /**
   * "Agora" (dia do bônus diário, janela de 15 dias do quinzenal) vem de `Clock` (`common/clock.ts`, regra 3 do
   * CLAUDE.md, ADR-0029), NUNCA de `new Date()` direto — senão a passagem do tempo não é testável. Em produção o
   * Nest injeta o `Clock` compartilhado (`ClockModule`); o padrão `SystemClock` (relógio real, comportamento de
   * antes, byte a byte) mantém válidas as chamadas `new WalletService(repo)` de testes e scripts.
   */
  constructor(private readonly repo: WalletRepository, private readonly clock: Clock = new SystemClock()) {}
  get(owner: string): Promise<Wallet> { return this.repo.get(owner); }

  /** Gasta recursos (congelar/descongelar). Atômico: só desconta se o saldo cobre o custo — nunca fica negativo, nem sob concorrência. */
  async charge(owner: string, cost: Partial<Wallet>): Promise<Wallet> {
    const c = cost.catalisadores ?? 0;
    const b = cost.biomassa ?? 0;
    const next = await this.repo.spendResources(owner, { catalisadores: c, biomassa: b });
    if (next) return next;
    // Não cobriu: só agora lê o saldo, pra dizer QUAL faltou (a decisão já foi tomada atomicamente acima).
    const w = await this.repo.get(owner);
    if (c > w.catalisadores) throw new BadRequestException("Catalisadores insuficientes.");
    if (b > w.biomassa) throw new BadRequestException("Biomassa insuficiente.");
    throw new BadRequestException("Saldo insuficiente."); // outro pedido gastou no meio; tente de novo
  }

  /** Credita recursos (fontes: streak, fixação, cota). Atômico. */
  async credit(owner: string, gain: Partial<Wallet>): Promise<Wallet> {
    return this.repo.addResources(owner, { catalisadores: gain.catalisadores ?? 0, biomassa: gain.biomassa ?? 0 });
  }

  /** Credita créditos (referral/compra) — 1 crédito = 1 nascimento extra. Atômico (`addImageCredits`). */
  async creditImageCredits(owner: string, n: number): Promise<Wallet> {
    return this.repo.addImageCredits(owner, n);
  }

  /**
   * Consome 1 crédito; `false` se não houver. ATÔMICO (`takeImageCredit`: `UPDATE ... WHERE image_credits > 0
   * RETURNING`): dois pedidos simultâneos com 1 crédito → só um passa; o saldo nunca fica negativo. Antes era
   * ler-e-gravar, e o mesmo crédito podia gerar duas imagens pagas na fal.ai.
   */
  async consumeImageCredit(owner: string): Promise<boolean> {
    return this.repo.takeImageCredit(owner);
  }

  /**
   * Bônus quinzenal (engajamento, ADR-0021 — era semanal, ADR-0019): +1
   * crédito (1 crédito = 1 nascimento extra), no máximo 1x a cada 15 dias
   * corridos. Janela MÓVEL
   * (timestamp, não bucket de calendário — 15 não divide um calendário em
   * buckets limpos como semana/mês dividem): compara `now` contra o
   * `lastBiweekly` gravado, igual à janela `rolling7d` já usada em
   * `quota.service.ts`. ATÔMICO: a janela é a condição do `UPDATE` — duas chamadas
   * simultâneas concedem UMA vez. NÃO depende de fuso (intervalo entre instantes; ADR-0029).
   */
  async claimBiweekly(owner: string): Promise<{ claimed: boolean; wallet: Wallet }> {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - BIWEEKLY_WINDOW_MS);
    const claimed = await this.repo.claimBiweekly(owner, now.toISOString(), cutoff.toISOString());
    if (claimed) return { claimed: true, wallet: claimed };
    return { claimed: false, wallet: await this.repo.get(owner) };
  }

  /**
   * Recompensa diária por tier (fonte principal — streak/cota). 1x por dia. ATÔMICO: "já coletou hoje" é a condição do `UPDATE`.
   * O "dia" é o dia CIVIL DE SÃO PAULO (`saoPauloDate`, `AAAA-MM-DD` do `Clock`) — o mesmo da vaga de nascimento diária
   * (ADR-0029, fuso único): vira à meia-noite de Brasília, não às 21:00 como quando era UTC. Guardado em `wallets.last_daily`.
   */
  async claimDaily(owner: string, tier: string): Promise<{ claimed: boolean; gain?: Partial<Wallet>; wallet: Wallet }> {
    const today = saoPauloDate(this.clock.now());
    const byTier: Record<string, { catalisadores: number; biomassa: number }> = {
      FREE: { catalisadores: 80, biomassa: 4000 }, JUNIOR: { catalisadores: 160, biomassa: 8000 },
      SENIOR: { catalisadores: 300, biomassa: 15000 }, PHD: { catalisadores: 600, biomassa: 30000 },
    };
    const gain = byTier[tier] ?? byTier.FREE!;
    const claimed = await this.repo.claimDaily(owner, today, gain);
    if (claimed) return { claimed: true, gain, wallet: claimed };
    return { claimed: false, wallet: await this.repo.get(owner) };
  }

  /** Recompensa por fixação: aura alta rende catalisadores + biomassa (anti-P2W: é ganho por MÉRITO genético, igual p/ todos). */
  async rewardForCross(owner: string, aura: number): Promise<Wallet | null> {
    if (aura < 4) return null; // só aura 4/5 (linhagem quase-pura/pura) recompensa
    const gain = aura >= 5 ? { catalisadores: 300, biomassa: 15000 } : { catalisadores: 120, biomassa: 6000 };
    return this.credit(owner, gain);
  }
}
