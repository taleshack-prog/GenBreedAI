/**
 * Testes do adapter Drizzle contra um Postgres REAL (PGlite/WASM).
 * Aplica as migrations geradas, semeia fundadores e exercita repositório +
 * serviço de cruzamento pela camada de banco. Mesmo código Drizzle da produção
 * (que usa `pg` contra a Neon). Ver ADR-0006.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import { specimens } from "../src/db/schema";
import { DrizzleSpecimenRepository } from "../src/specimens/drizzle.repository";
import { founderSeeds } from "../src/specimens/in-memory.repository";
import { CrossService } from "../src/cross/cross.service";

async function makeDb() {
  const client = new PGlite(); // Postgres em memória (WASM)
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  // Semeia fundadores.
  for (const f of founderSeeds()) {
    await db.insert(specimens).values({
      id: f.id, ownerId: f.ownerId, pack: f.pack, species: f.species,
      genotype: f.genotype, phenotype: f.phenotype ?? null, generation: f.generation,
      sireId: f.sireId, damId: f.damId, method: f.method, fPedigree: f.fPedigree,
      fixationIndex: f.fixationIndex, aura: f.aura, cacheKey: f.cacheKey,
      provenanceHash: f.provenanceHash ?? null,
    });
  }
  return db;
}

describe("DrizzleSpecimenRepository (Postgres real via PGlite)", () => {
  let repo: DrizzleSpecimenRepository;
  let service: CrossService;

  beforeAll(async () => {
    const db = await makeDb();
    repo = new DrizzleSpecimenRepository(db);
    service = new CrossService(repo);
  });

  it("carrega fundadores semeados (get)", async () => {
    const negra = await repo.get("negra");
    expect(negra?.species).toBe("panthera");
    expect(negra?.genotype.loci.A).toEqual(["A", "a"]);
  });

  it("buildPedigree reconstrói ancestrais de delta", async () => {
    const ped = await repo.buildPedigree(["delta", "negra"]);
    expect(ped.delta).toEqual({ id: "delta", sire: "puma", dam: "negra" });
    expect(ped.puma).toBeDefined();
    expect(ped.negra).toBeDefined();
  });

  it("cruzamento BC1 persiste no Postgres com F_pedigree = 0.25", async () => {
    const r = await service.execute("owner-db", {
      sireId: "delta", damId: "negra", method: "BC1", seed: "db-test",
    });
    expect(r.engine.fPedigree).toBe(0.25);
    // Recupera do banco e confere persistência do genótipo (JSONB).
    const saved = await repo.get(r.specimen.id);
    expect(saved?.ownerId).toBe("owner-db");
    expect(saved?.fPedigree).toBe(0.25);
    expect(saved?.genotype.loci.A).toBeDefined();
    expect((await repo.listByOwner("owner-db")).length).toBe(1);
  });

  it("determinismo persiste: mesma seed → mesmo cacheKey na 2ª gravação", async () => {
    const a = await service.execute("u2", { sireId: "golden", damId: "poodle", method: "F1", seed: "k" });
    const b = await service.execute("u2", { sireId: "golden", damId: "poodle", method: "F1", seed: "k" });
    expect(a.cacheKey).toBe(b.cacheKey);
  });
});
