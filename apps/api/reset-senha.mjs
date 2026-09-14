import "dotenv/config";
import bcrypt from "bcryptjs";
import readline from "node:readline";
import { createDb } from "./src/db/client.ts";
import { users } from "./src/db/schema.ts";
import { eq } from "drizzle-orm";
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));
const email = (await ask("E-mail: ")).trim().toLowerCase();
const senha = await ask("Nova senha (min 8): ");
rl.close();
if (senha.length < 8) { console.log("Senha muito curta."); process.exit(1); }
const hash = await bcrypt.hash(senha, 10);
const { db, pool } = createDb(process.env.DATABASE_URL);
const r = await db.update(users).set({ passwordHash: hash }).where(eq(users.email, email)).returning();
await pool.end();
console.log(r.length ? "OK, senha trocada." : "E-mail nao encontrado.");
