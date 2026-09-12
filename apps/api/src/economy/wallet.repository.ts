/** Porta de persistência da carteira (in-memory p/ dev/testes; Drizzle p/ Neon). */
import { eq } from "drizzle-orm";
import { wallets } from "../db/schema";

export interface Wallet { catalisadores: number; biomassa: number; lastDaily?: string | null; lastWeekly?: string | null; imageCredits?: number; }
export const START: Wallet = { catalisadores: 12450, biomassa: 125480 };

export abstract class WalletRepository {
  abstract get(owner: string): Promise<Wallet>;
  abstract save(owner: string, w: Wallet): Promise<void>;
}

export class InMemoryWalletRepository extends WalletRepository {
  private readonly m = new Map<string, Wallet>();
  async get(owner: string): Promise<Wallet> {
    if (!this.m.has(owner)) this.m.set(owner, { ...START });
    return { ...this.m.get(owner)! };
  }
  async save(owner: string, w: Wallet): Promise<void> { this.m.set(owner, { ...w }); }
}

export class DrizzleWalletRepository extends WalletRepository {
  constructor(private readonly db: any) { super(); }
  async get(owner: string): Promise<Wallet> {
    const rows = await this.db.select().from(wallets).where(eq(wallets.ownerId, owner));
    if (rows[0]) return { catalisadores: rows[0].catalisadores, biomassa: rows[0].biomassa, lastDaily: rows[0].lastDaily ?? null, lastWeekly: rows[0].lastWeekly ?? null, imageCredits: rows[0].imageCredits ?? 0 };
    await this.db.insert(wallets).values({ ownerId: owner, ...START }).onConflictDoNothing({ target: wallets.ownerId });
    return { ...START };
  }
  async save(owner: string, w: Wallet): Promise<void> {
    await this.db.insert(wallets).values({ ownerId: owner, catalisadores: w.catalisadores, biomassa: w.biomassa, lastDaily: w.lastDaily ?? null, lastWeekly: w.lastWeekly ?? null, imageCredits: w.imageCredits ?? 0 })
      .onConflictDoUpdate({ target: wallets.ownerId, set: { catalisadores: w.catalisadores, biomassa: w.biomassa, lastDaily: w.lastDaily ?? null, lastWeekly: w.lastWeekly ?? null, imageCredits: w.imageCredits ?? 0 } });
  }
}
