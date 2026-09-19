/**
 * Porta de persistência da carteira (in-memory p/ dev/testes; Drizzle p/ Neon).
 *
 * REGRA (ADR-0029): todo ajuste de saldo é UM comando atômico — `UPDATE ... SET x = x ± n [WHERE
 * <condição>] RETURNING` (ou `INSERT ... ON CONFLICT DO UPDATE`) — NUNCA `get` seguido de `save`.
 * Ler e gravar em dois passos deixa dois pedidos simultâneos lerem o MESMO saldo: o crédito some (o
 * segundo grava por cima), o gasto passa duas vezes (um crédito vira duas imagens pagas na fal.ai) e
 * o `save` ainda regrava a carteira INTEIRA, apagando o que o pedido não conhecia (créditos comprados,
 * janelas do bônus). Por isso cada operação abaixo só toca as colunas que ela muda. `save` sobra só
 * para montar estados em testes — nenhum código de produção o chama.
 */
import { and, eq, gt, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { wallets } from "../db/schema";

export interface Wallet { catalisadores: number; biomassa: number; lastDaily?: string | null; lastBiweekly?: string | null; imageCredits?: number; }
export const START: Wallet = { catalisadores: 12450, biomassa: 125480 };

export interface ResourceAmounts { catalisadores: number; biomassa: number }

export abstract class WalletRepository {
  abstract get(owner: string): Promise<Wallet>;
  /** Só testes: regrava a carteira INTEIRA (por isso não serve para ajustar saldo em produção — ver a regra no topo). */
  abstract save(owner: string, w: Wallet): Promise<void>;
  /**
   * Soma `n` ao saldo de créditos de imagem, ATOMICAMENTE, e devolve a carteira atualizada. Créditos que
   * chegam ao mesmo tempo na MESMA carteira (webhooks do Stripe em paralelo, dois trios de indicação) nunca
   * se sobrescrevem. Cria a carteira se ainda não existir.
   */
  abstract addImageCredits(owner: string, n: number): Promise<Wallet>;
  /**
   * Gasta 1 crédito de imagem, ATOMICAMENTE: só desconta se houver saldo (`image_credits > 0`). `true` = gastou;
   * `false` = não tinha. Dois pedidos simultâneos com 1 crédito: só UM recebe `true`; o saldo nunca fica negativo.
   */
  abstract takeImageCredit(owner: string): Promise<boolean>;
  /** Soma catalisadores/biomassa, ATOMICAMENTE (só essas duas colunas). Cria a carteira se não existir. */
  abstract addResources(owner: string, gain: ResourceAmounts): Promise<Wallet>;
  /**
   * Gasta catalisadores/biomassa, ATOMICAMENTE: só desconta se AS DUAS cobrirem o custo. Devolve a carteira
   * atualizada, ou `null` se o saldo não cobre (nada é descontado). Nunca deixa o saldo negativo.
   */
  abstract spendResources(owner: string, cost: ResourceAmounts): Promise<Wallet | null>;
  /**
   * Recompensa diária, ATOMICAMENTE: só concede se `last_daily` ainda não for `today` (AAAA-MM-DD) — soma
   * `gain` e grava `today`. `null` = já coletou hoje (duas chamadas simultâneas: só uma leva).
   */
  abstract claimDaily(owner: string, today: string, gain: ResourceAmounts): Promise<Wallet | null>;
  /**
   * Bônus quinzenal, ATOMICAMENTE: só concede se nunca coletou ou se `last_biweekly <= cutoffIso` (janela de 15
   * dias já passou) — soma 1 crédito e grava `nowIso`. `null` = ainda na janela. Os instantes são ISO 8601 em UTC
   * (mesmo formato gravado), então a comparação de texto é a comparação de tempo.
   */
  abstract claimBiweekly(owner: string, nowIso: string, cutoffIso: string): Promise<Wallet | null>;
}

export class InMemoryWalletRepository extends WalletRepository {
  private readonly m = new Map<string, Wallet>();
  async get(owner: string): Promise<Wallet> {
    if (!this.m.has(owner)) this.m.set(owner, { ...START });
    return { ...this.m.get(owner)! };
  }
  async save(owner: string, w: Wallet): Promise<void> { this.m.set(owner, { ...w }); }

  // Todos os métodos abaixo leem e gravam SEM `await` no meio: o JS é single-thread, então cada um é
  // indivisível — o equivalente em memória do UPDATE atômico do Postgres.
  private cur(owner: string): Wallet { return this.m.get(owner) ?? { ...START }; }

  async addImageCredits(owner: string, n: number): Promise<Wallet> {
    const next: Wallet = { ...this.cur(owner), imageCredits: (this.cur(owner).imageCredits ?? 0) + n };
    this.m.set(owner, next);
    return { ...next };
  }

  async takeImageCredit(owner: string): Promise<boolean> {
    const cur = this.m.get(owner);
    if (!cur || (cur.imageCredits ?? 0) <= 0) return false;
    this.m.set(owner, { ...cur, imageCredits: (cur.imageCredits ?? 0) - 1 });
    return true;
  }

  async addResources(owner: string, gain: ResourceAmounts): Promise<Wallet> {
    const cur = this.cur(owner);
    const next: Wallet = { ...cur, catalisadores: cur.catalisadores + gain.catalisadores, biomassa: cur.biomassa + gain.biomassa };
    this.m.set(owner, next);
    return { ...next };
  }

  async spendResources(owner: string, cost: ResourceAmounts): Promise<Wallet | null> {
    const cur = this.cur(owner);
    if (cur.catalisadores < cost.catalisadores || cur.biomassa < cost.biomassa) return null;
    const next: Wallet = { ...cur, catalisadores: cur.catalisadores - cost.catalisadores, biomassa: cur.biomassa - cost.biomassa };
    this.m.set(owner, next);
    return { ...next };
  }

  async claimDaily(owner: string, today: string, gain: ResourceAmounts): Promise<Wallet | null> {
    const cur = this.cur(owner);
    if (cur.lastDaily === today) return null;
    const next: Wallet = { ...cur, catalisadores: cur.catalisadores + gain.catalisadores, biomassa: cur.biomassa + gain.biomassa, lastDaily: today };
    this.m.set(owner, next);
    return { ...next };
  }

  async claimBiweekly(owner: string, nowIso: string, cutoffIso: string): Promise<Wallet | null> {
    const cur = this.cur(owner);
    if (cur.lastBiweekly && cur.lastBiweekly > cutoffIso) return null;
    const next: Wallet = { ...cur, imageCredits: (cur.imageCredits ?? 0) + 1, lastBiweekly: nowIso };
    this.m.set(owner, next);
    return { ...next };
  }
}

export class DrizzleWalletRepository extends WalletRepository {
  constructor(private readonly db: any) { super(); }

  private toWallet(r: any): Wallet {
    return { catalisadores: r.catalisadores, biomassa: r.biomassa, lastDaily: r.lastDaily ?? null, lastBiweekly: r.lastBiweekly ?? null, imageCredits: r.imageCredits ?? 0 };
  }

  /** Garante a linha da carteira (valores iniciais) sem tocar numa que já exista — pré-requisito dos UPDATEs condicionais. */
  private async ensure(owner: string): Promise<void> {
    await this.db.insert(wallets).values({ ownerId: owner, catalisadores: START.catalisadores, biomassa: START.biomassa }).onConflictDoNothing({ target: wallets.ownerId });
  }

  async get(owner: string): Promise<Wallet> {
    const rows = await this.db.select().from(wallets).where(eq(wallets.ownerId, owner));
    if (rows[0]) return this.toWallet(rows[0]);
    await this.ensure(owner);
    return { ...START };
  }

  async save(owner: string, w: Wallet): Promise<void> {
    await this.db.insert(wallets).values({ ownerId: owner, catalisadores: w.catalisadores, biomassa: w.biomassa, lastDaily: w.lastDaily ?? null, lastBiweekly: w.lastBiweekly ?? null, imageCredits: w.imageCredits ?? 0 })
      .onConflictDoUpdate({ target: wallets.ownerId, set: { catalisadores: w.catalisadores, biomassa: w.biomassa, lastDaily: w.lastDaily ?? null, lastBiweekly: w.lastBiweekly ?? null, imageCredits: w.imageCredits ?? 0 } });
  }

  /** `INSERT ... ON CONFLICT (owner_id) DO UPDATE SET image_credits = image_credits + n RETURNING` — carteira nova nasce com `START` e já com `n`. */
  async addImageCredits(owner: string, n: number): Promise<Wallet> {
    const rows = await this.db.insert(wallets)
      .values({ ownerId: owner, catalisadores: START.catalisadores, biomassa: START.biomassa, imageCredits: n })
      .onConflictDoUpdate({ target: wallets.ownerId, set: { imageCredits: sql`${wallets.imageCredits} + ${n}` } })
      .returning();
    return this.toWallet(rows[0]);
  }

  /** `UPDATE wallets SET image_credits = image_credits - 1 WHERE owner_id = $1 AND image_credits > 0 RETURNING` — sem linha (ou sem saldo) → 0 linhas → `false`. */
  async takeImageCredit(owner: string): Promise<boolean> {
    const rows = await this.db.update(wallets)
      .set({ imageCredits: sql`${wallets.imageCredits} - 1` })
      .where(and(eq(wallets.ownerId, owner), gt(wallets.imageCredits, 0)))
      .returning({ id: wallets.ownerId });
    return rows.length > 0;
  }

  /** `INSERT ... ON CONFLICT DO UPDATE SET catalisadores = catalisadores + c, biomassa = biomassa + b RETURNING`. */
  async addResources(owner: string, gain: ResourceAmounts): Promise<Wallet> {
    const rows = await this.db.insert(wallets)
      .values({ ownerId: owner, catalisadores: START.catalisadores + gain.catalisadores, biomassa: START.biomassa + gain.biomassa })
      .onConflictDoUpdate({
        target: wallets.ownerId,
        set: { catalisadores: sql`${wallets.catalisadores} + ${gain.catalisadores}`, biomassa: sql`${wallets.biomassa} + ${gain.biomassa}` },
      })
      .returning();
    return this.toWallet(rows[0]);
  }

  /** `UPDATE ... SET catalisadores = catalisadores - c, biomassa = biomassa - b WHERE owner_id = $1 AND catalisadores >= c AND biomassa >= b RETURNING`. */
  async spendResources(owner: string, cost: ResourceAmounts): Promise<Wallet | null> {
    await this.ensure(owner);
    const rows = await this.db.update(wallets)
      .set({ catalisadores: sql`${wallets.catalisadores} - ${cost.catalisadores}`, biomassa: sql`${wallets.biomassa} - ${cost.biomassa}` })
      .where(and(eq(wallets.ownerId, owner), gte(wallets.catalisadores, cost.catalisadores), gte(wallets.biomassa, cost.biomassa)))
      .returning();
    return rows[0] ? this.toWallet(rows[0]) : null;
  }

  /** `UPDATE ... SET catalisadores = catalisadores + c, biomassa = biomassa + b, last_daily = today WHERE owner_id = $1 AND (last_daily IS NULL OR last_daily <> today) RETURNING`. */
  async claimDaily(owner: string, today: string, gain: ResourceAmounts): Promise<Wallet | null> {
    await this.ensure(owner);
    const rows = await this.db.update(wallets)
      .set({ catalisadores: sql`${wallets.catalisadores} + ${gain.catalisadores}`, biomassa: sql`${wallets.biomassa} + ${gain.biomassa}`, lastDaily: today })
      .where(and(eq(wallets.ownerId, owner), or(isNull(wallets.lastDaily), ne(wallets.lastDaily, today))))
      .returning();
    return rows[0] ? this.toWallet(rows[0]) : null;
  }

  /** `UPDATE ... SET image_credits = image_credits + 1, last_biweekly = now WHERE owner_id = $1 AND (last_biweekly IS NULL OR last_biweekly <= cutoff) RETURNING`. */
  async claimBiweekly(owner: string, nowIso: string, cutoffIso: string): Promise<Wallet | null> {
    await this.ensure(owner);
    const rows = await this.db.update(wallets)
      .set({ imageCredits: sql`${wallets.imageCredits} + 1`, lastBiweekly: nowIso })
      .where(and(eq(wallets.ownerId, owner), or(isNull(wallets.lastBiweekly), lte(wallets.lastBiweekly, cutoffIso))))
      .returning();
    return rows[0] ? this.toWallet(rows[0]) : null;
  }
}
