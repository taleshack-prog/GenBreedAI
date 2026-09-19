import { and, eq, isNull } from "drizzle-orm";
import { users } from "../db/schema";
import { createDb } from "../db/client";

export interface UserRow {
  id: string; email: string | null; name: string | null;
  passwordHash: string | null; googleId: string | null;
  tier: "FREE" | "JUNIOR" | "SENIOR" | "PHD"; streak: number; xp: number;
}

export abstract class UserRepository {
  abstract findByEmail(email: string): Promise<UserRow | null>;
  abstract findById(id: string): Promise<UserRow | null>;
  abstract findByGoogleId(googleId: string): Promise<UserRow | null>;
  abstract create(u: Omit<UserRow, "streak" | "xp">): Promise<UserRow>;

  /**
   * Marca da PRIMEIRA gestação da conta (ADR-0025) — cortesia de 5 minutos, uma
   * vez por conta. Vive aqui (e não nas entradas da incubadora) porque as
   * entradas somem; a marca nunca some nem muda depois de gravada.
   *
   * `claimFirstGestation`: ATÔMICO — só UM chamador recebe `true` por conta
   * (duas gestações simultâneas não ganham as duas os 5 minutos). Grava `at`
   * e o `entryId` da entrada vencedora JUNTOS; é o `entryId` (não o instante)
   * que identifica a entrada acelerada — dois pedidos no mesmo milissegundo
   * teriam o mesmo `at`. Conta inexistente ou já marcada → `false`.
   */
  abstract claimFirstGestation(userId: string, at: Date, entryId: string): Promise<boolean>;
  /**
   * Desfaz o claim SÓ se a marca ainda for a da entrada `entryId` — usado
   * quando a gestação que a reivindicou falhou antes de acontecer (a cortesia
   * não pode ser queimada por um erro). Nunca mexe na marca de outra entrada.
   */
  abstract releaseFirstGestation(userId: string, entryId: string): Promise<void>;
  /** `null` = a cortesia ainda está disponível. */
  abstract getFirstGestation(userId: string): Promise<FirstGestationMark | null>;
}

export interface FirstGestationMark { at: Date; entryId: string }

export class InMemoryUserRepository extends UserRepository {
  private m = new Map<string, UserRow>();
  /**
   * Independente das linhas de `m` DE PROPÓSITO: fora de produção, usuários
   * de cabeçalho dev (`AUTH_DEV_HEADERS`) e os testes e2e não têm linha em
   * `users`. O adapter Drizzle exige a linha (todo usuário real tem: cadastro/
   * Google sempre criam) — em produção a diferença não existe.
   */
  private firstGestation = new Map<string, FirstGestationMark>();
  async claimFirstGestation(userId: string, at: Date, entryId: string) {
    if (this.firstGestation.has(userId)) return false;
    this.firstGestation.set(userId, { at, entryId });
    return true;
  }
  async releaseFirstGestation(userId: string, entryId: string) {
    if (this.firstGestation.get(userId)?.entryId === entryId) this.firstGestation.delete(userId);
  }
  async getFirstGestation(userId: string) { return this.firstGestation.get(userId) ?? null; }
  async findByEmail(email: string) { return [...this.m.values()].find((u) => u.email === email) ?? null; }
  async findById(id: string) { return this.m.get(id) ?? null; }
  async findByGoogleId(g: string) { return [...this.m.values()].find((u) => u.googleId === g) ?? null; }
  async create(u: Omit<UserRow, "streak" | "xp">) { const row: UserRow = { ...u, streak: 0, xp: 0 }; this.m.set(u.id, row); return row; }
}

export class DrizzleUserRepository extends UserRepository {
  constructor(private readonly db: ReturnType<typeof createDb>["db"]) { super(); }
  private map(r: any): UserRow { return { id: r.id, email: r.email, name: r.name, passwordHash: r.passwordHash, googleId: r.googleId, tier: r.tier, streak: r.streak, xp: r.xp }; }
  async findByEmail(email: string) { const r = await this.db.select().from(users).where(eq(users.email, email)); return r[0] ? this.map(r[0]) : null; }
  async findById(id: string) { const r = await this.db.select().from(users).where(eq(users.id, id)); return r[0] ? this.map(r[0]) : null; }
  async findByGoogleId(g: string) { const r = await this.db.select().from(users).where(eq(users.googleId, g)); return r[0] ? this.map(r[0]) : null; }
  async create(u: Omit<UserRow, "streak" | "xp">) {
    await this.db.insert(users).values({ id: u.id, email: u.email, name: u.name, passwordHash: u.passwordHash, googleId: u.googleId, tier: u.tier });
    return { ...u, streak: 0, xp: 0 };
  }
  async claimFirstGestation(userId: string, at: Date, entryId: string) {
    // UPDATE condicional = atômico no Postgres: só a 1ª transação que vê NULL grava (as duas colunas juntas).
    const r = await this.db.update(users).set({ firstGestationAt: at, firstGestationEntryId: entryId })
      .where(and(eq(users.id, userId), isNull(users.firstGestationAt)))
      .returning({ id: users.id });
    return r.length > 0;
  }
  async releaseFirstGestation(userId: string, entryId: string) {
    await this.db.update(users).set({ firstGestationAt: null, firstGestationEntryId: null })
      .where(and(eq(users.id, userId), eq(users.firstGestationEntryId, entryId)));
  }
  async getFirstGestation(userId: string) {
    const r = await this.db.select({ at: users.firstGestationAt, entryId: users.firstGestationEntryId })
      .from(users).where(eq(users.id, userId));
    const row = r[0];
    return row?.at && row.entryId ? { at: row.at, entryId: row.entryId } : null;
  }
}
