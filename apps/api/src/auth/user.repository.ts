import { eq } from "drizzle-orm";
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
}

export class InMemoryUserRepository extends UserRepository {
  private m = new Map<string, UserRow>();
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
}
