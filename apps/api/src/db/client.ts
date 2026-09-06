/**
 * Cliente Drizzle de produção via node-postgres (`pg`). Conecta a qualquer
 * PostgreSQL por `DATABASE_URL` — Neon, Railway ou local nativo.
 *
 * Para a Neon: a URL usa `sslmode=require`. Se você encontrar erro de
 * channel binding com o driver, remova `&channel_binding=require` da URL.
 *
 * SSL: habilitado automaticamente quando a URL contém `neon.tech` ou
 * `sslmode=require`.
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createPool(databaseUrl: string): pg.Pool {
  const needsSsl =
    databaseUrl.includes("neon.tech") || /sslmode=require/.test(databaseUrl);
  return new pg.Pool({
    connectionString: databaseUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
}

export function createDb(databaseUrl: string): { db: Database; pool: pg.Pool } {
  const pool = createPool(databaseUrl);
  const db = drizzle(pool, { schema });
  return { db, pool };
}
