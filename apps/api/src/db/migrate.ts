/**
 * Aplica as migrations Drizzle ao banco de DATABASE_URL (Neon/local).
 * Uso: `pnpm --filter @genbreedai/api db:migrate` (com DATABASE_URL no ambiente).
 */
import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente. Defina no .env (ver .env.example).");
  const { db, pool } = createDb(url);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  // eslint-disable-next-line no-console
  console.log("Migrations aplicadas com sucesso.");
}
main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
