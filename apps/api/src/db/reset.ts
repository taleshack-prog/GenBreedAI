/**
 * Reset dos dados para o modelo do TDD (B/K/M/H/S/A). Limpa TODOS os espécimes e
 * cruzamentos e re-semeia os fundadores atuais (felinos base + caninos).
 * Uso: pnpm --filter @genbreedai/api db:reset  (com DATABASE_URL no .env)
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "./client";
import { specimens, crosses } from "./schema";
import { founderSeeds } from "../specimens/in-memory.repository";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente (veja .env.example).");
  const { db, pool } = createDb(url);
  // Garante o schema novo (idempotente) antes de semear.
  await db.execute(sql`ALTER TABLE specimens ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ALIVE'`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS wallets (owner_id text PRIMARY KEY, catalisadores integer NOT NULL DEFAULT 12450, biomassa integer NOT NULL DEFAULT 125480)`);
  await db.execute(sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS last_daily text`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS image_quota (owner_id text NOT NULL, ym text NOT NULL, used integer NOT NULL DEFAULT 0, PRIMARY KEY (owner_id, ym))`);
  await db.execute(sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS last_weekly text`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name text`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id text`);
  await db.execute(sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS image_credits integer NOT NULL DEFAULT 0`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS referral_links (owner_id text PRIMARY KEY, code text NOT NULL UNIQUE, clicks integer NOT NULL DEFAULT 0, installs integer NOT NULL DEFAULT 0, d1 integer NOT NULL DEFAULT 0, d7 integer NOT NULL DEFAULT 0, conversions integer NOT NULL DEFAULT 0, credits_earned integer NOT NULL DEFAULT 0)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS referral_referred (code text NOT NULL, referred_id text NOT NULL, install_credited boolean NOT NULL DEFAULT false, d1_credited boolean NOT NULL DEFAULT false, d7_credited boolean NOT NULL DEFAULT false, convert_credited boolean NOT NULL DEFAULT false, first_seen text, PRIMARY KEY (code, referred_id))`);
  await db.delete(crosses);
  await db.delete(specimens);
  for (const f of founderSeeds()) {
    await db.insert(specimens).values({
      id: f.id, ownerId: f.ownerId, pack: f.pack, species: f.species, genotype: f.genotype,
      phenotype: null, generation: f.generation, sireId: f.sireId, damId: f.damId, method: f.method,
      fPedigree: f.fPedigree, fixationIndex: f.fixationIndex, aura: f.aura, cacheKey: f.cacheKey, provenanceHash: null,
    });
  }
  await pool.end();
  // eslint-disable-next-line no-console
  console.log(`Reset concluído. Fundadores: ${founderSeeds().map((f) => f.id).join(", ")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
