/**
 * Reset dos dados para o modelo do TDD (B/K/M/H/S/A). Limpa TODOS os espécimes e
 * cruzamentos e re-semeia os fundadores atuais (felinos base + caninos).
 * Uso: pnpm --filter @genbreedai/api db:reset  (com DATABASE_URL no .env)
 */
import "dotenv/config";
import { createDb } from "./client";
import { specimens, crosses } from "./schema";
import { founderSeeds } from "../specimens/in-memory.repository";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente (veja .env.example).");
  const { db, pool } = createDb(url);
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
