/** Economia (TDD §7): carteira persistida. Catalisadores (congelar) + Biomassa (descongelar). */
import { BadRequestException, Injectable } from "@nestjs/common";
import { WalletRepository, type Wallet } from "./wallet.repository";

export type { Wallet };
export const FREEZE_COST = { catalisadores: 20 };
export const THAW_COST = { biomassa: 10000 };
/** Janela do bônus de crédito de imagem (ADR-0021 — 15 dias corridos, era 7/semanal na ADR-0019). */
const BIWEEKLY_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

@Injectable()
export class WalletService {
  constructor(private readonly repo: WalletRepository) {}
  get(owner: string): Promise<Wallet> { return this.repo.get(owner); }
  async charge(owner: string, cost: Partial<Wallet>): Promise<Wallet> {
    const w = await this.repo.get(owner);
    if ((cost.catalisadores ?? 0) > w.catalisadores) throw new BadRequestException("Catalisadores insuficientes.");
    if ((cost.biomassa ?? 0) > w.biomassa) throw new BadRequestException("Biomassa insuficiente.");
    const next: Wallet = { catalisadores: w.catalisadores - (cost.catalisadores ?? 0), biomassa: w.biomassa - (cost.biomassa ?? 0) };
    await this.repo.save(owner, next);
    return next;
  }

  /** Credita recursos (fontes: streak, fixação, cota). */
  async credit(owner: string, gain: Partial<Wallet>): Promise<Wallet> {
    const w = await this.repo.get(owner);
    const next: Wallet = { catalisadores: w.catalisadores + (gain.catalisadores ?? 0), biomassa: w.biomassa + (gain.biomassa ?? 0) };
    await this.repo.save(owner, next);
    return next;
  }

  /** Credita créditos de imagem (referral/compra). */
  async creditImageCredits(owner: string, n: number): Promise<Wallet> {
    const w = await this.repo.get(owner);
    const next: Wallet = { ...w, imageCredits: (w.imageCredits ?? 0) + n };
    await this.repo.save(owner, next);
    return next;
  }
  /** Consome 1 crédito de imagem; false se não houver. */
  async consumeImageCredit(owner: string): Promise<boolean> {
    const w = await this.repo.get(owner);
    if ((w.imageCredits ?? 0) <= 0) return false;
    await this.repo.save(owner, { ...w, imageCredits: (w.imageCredits ?? 0) - 1 });
    return true;
  }
  /**
   * Imagem quinzenal (engajamento, ADR-0021 — era semanal, ADR-0019): +1
   * crédito de imagem, no máximo 1x a cada 15 dias corridos. Janela MÓVEL
   * (timestamp, não bucket de calendário — 15 não divide um calendário em
   * buckets limpos como semana/mês dividem): compara `now` contra o
   * `lastBiweekly` gravado, igual à janela `rolling7d` já usada em
   * `quota.service.ts`.
   */
  async claimBiweekly(owner: string): Promise<{ claimed: boolean; wallet: Wallet }> {
    const w = await this.repo.get(owner);
    const now = new Date();
    if (w.lastBiweekly) {
      const last = new Date(w.lastBiweekly);
      if (now.getTime() - last.getTime() < BIWEEKLY_WINDOW_MS) return { claimed: false, wallet: w };
    }
    const next: Wallet = { ...w, imageCredits: (w.imageCredits ?? 0) + 1, lastBiweekly: now.toISOString() };
    await this.repo.save(owner, next);
    return { claimed: true, wallet: next };
  }

  /** Recompensa diária por tier (fonte principal — streak/cota). 1x por dia. */
  async claimDaily(owner: string, tier: string): Promise<{ claimed: boolean; gain?: Partial<Wallet>; wallet: Wallet }> {
    const w = await this.repo.get(owner);
    const today = new Date().toISOString().slice(0, 10);
    if (w.lastDaily === today) return { claimed: false, wallet: w };
    const byTier: Record<string, { catalisadores: number; biomassa: number }> = {
      FREE: { catalisadores: 80, biomassa: 4000 }, JUNIOR: { catalisadores: 160, biomassa: 8000 },
      SENIOR: { catalisadores: 300, biomassa: 15000 }, PHD: { catalisadores: 600, biomassa: 30000 },
    };
    const gain = byTier[tier] ?? byTier.FREE!;
    const next: Wallet = { catalisadores: w.catalisadores + gain.catalisadores, biomassa: w.biomassa + gain.biomassa, lastDaily: today };
    await this.repo.save(owner, next);
    return { claimed: true, gain, wallet: next };
  }

  /** Recompensa por fixação: aura alta rende catalisadores + biomassa (anti-P2W: é ganho por MÉRITO genético, igual p/ todos). */
  async rewardForCross(owner: string, aura: number): Promise<Wallet | null> {
    if (aura < 4) return null; // só aura 4/5 (linhagem quase-pura/pura) recompensa
    const gain = aura >= 5 ? { catalisadores: 300, biomassa: 15000 } : { catalisadores: 120, biomassa: 6000 };
    return this.credit(owner, gain);
  }
}
