/**
 * Semeia os espécimes-fundadores do Gene-Bank no banco (idempotente).
 * Uso: `pnpm --filter @genbreedai/api db:seed` (após db:migrate).
 */
import "dotenv/config";
import { createDb } from "./client";
import { specimens } from "./schema";
import { founderSeeds } from "../specimens/in-memory.repository";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente. Defina no .env (ver .env.example).");
  const { db, pool } = createDb(url);
  for (const f of founderSeeds()) {
    await db
      .insert(specimens)
      .values({
        id: f.id, ownerId: f.ownerId, pack: f.pack, species: f.species,
        genotype: f.genotype, phenotype: f.phenotype ?? null, generation: f.generation,
        sireId: f.sireId, damId: f.damId, method: f.method, fPedigree: f.fPedigree,
        fixationIndex: f.fixationIndex, aura: f.aura, cacheKey: f.cacheKey,
        provenanceHash: f.provenanceHash ?? null,
      })
      .onConflictDoNothing({ target: specimens.id });
  }
  await pool.end();
  // eslint-disable-next-line no-console
  console.log(`Fundadores semeados: ${founderSeeds().map((f) => f.id).join(", ")}`);
}
main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
