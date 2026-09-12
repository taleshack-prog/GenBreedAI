/** Economia (TDD §7): carteira persistida. Catalisadores (congelar) + Biomassa (descongelar). */
import { BadRequestException, Injectable } from "@nestjs/common";
import { WalletRepository, type Wallet } from "./wallet.repository";

export type { Wallet };
export const FREEZE_COST = { catalisadores: 20 };
function weekKey(): string { const d = new Date(); const onejan = new Date(d.getFullYear(),0,1); const wk = Math.ceil((((d.getTime()-onejan.getTime())/86400000)+onejan.getDay()+1)/7); return `${d.getFullYear()}-W${wk}`; }
export const THAW_COST = { biomassa: 10000 };

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
  /** Imagem semanal (engajamento): +1 crédito de imagem, 1x por semana. */
  async claimWeekly(owner: string): Promise<{ claimed: boolean; wallet: Wallet }> {
    const w = await this.repo.get(owner);
    const week = weekKey();
    if (w.lastWeekly === week) return { claimed: false, wallet: w };
    const next: Wallet = { ...w, imageCredits: (w.imageCredits ?? 0) + 1, lastWeekly: week };
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
