/**
 * Cliente Drizzle de produção via node-postgres (`pg`). Conecta a qualquer
 * PostgreSQL por `DATABASE_URL` — Neon, Railway ou local nativo.
 *
 * IMPORTANTE: o pool SEMPRE registra um handler de 'error'. Sem ele, uma queda
 * de conexão (idle/timeout/rede — comum na Neon serverless) emite um evento
 * 'error' não tratado que DERRUBA o processo Node inteiro. O handler apenas
 * loga; o pool se recupera reconectando na próxima query.
 *
 * Além disso, cacheamos UM pool por URL (singleton) para não abrir vários pools
 * (specimens, wallet, referral, quota, billing) contra a mesma Neon.
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

const poolCache = new Map<string, pg.Pool>();
const dbCache = new Map<string, Database>();

export function createPool(databaseUrl: string): pg.Pool {
  const cached = poolCache.get(databaseUrl);
  if (cached) return cached;

  const needsSsl =
    databaseUrl.includes("neon.tech") || /sslmode=require/.test(databaseUrl);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Sem este handler, um erro de conexão ocioso derruba o processo.
  pool.on("error", (err) => {
    console.error("[pg pool] erro de conexão (tratado, não fatal):", err.message);
  });
  poolCache.set(databaseUrl, pool);
  return pool;
}

export function createDb(databaseUrl: string): { db: Database; pool: pg.Pool } {
  const pool = createPool(databaseUrl);
  let db = dbCache.get(databaseUrl);
  if (!db) { db = drizzle(pool, { schema }); dbCache.set(databaseUrl, db); }
  return { db, pool };
}
