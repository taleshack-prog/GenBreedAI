import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
/** Adapter Drizzle contra Postgres real (PGlite), modelo v2. */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import { specimens } from "../src/db/schema";
import { DrizzleSpecimenRepository } from "../src/specimens/drizzle.repository";
import { founderSeeds, FOUNDER_SEX } from "../src/specimens/in-memory.repository";
import { CrossService } from "../src/cross/cross.service";
import { firstSeedWithSex } from "./helpers/seed-for-sex";

async function makeDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  for (const f of founderSeeds()) {
    await db.insert(specimens).values({
      id: f.id, ownerId: f.ownerId, pack: f.pack, species: f.species, genotype: f.genotype,
      phenotype: null, generation: f.generation, sireId: f.sireId, damId: f.damId, method: f.method,
      fPedigree: f.fPedigree, fixationIndex: f.fixationIndex, aura: f.aura, cacheKey: f.cacheKey, provenanceHash: null,
      // Sexo EXPLÍCITO (mesma tabela literal de in-memory.repository.ts, não
      // duplicada) — sem isso, a coluna fica NULL no PGlite e o motor rejeita
      // ("Espécime sem sexo definido") em qualquer cruzamento.
      sex: FOUNDER_SEX[f.id]!,
    });
  }
  return db;
}

describe("DrizzleSpecimenRepository (Postgres real via PGlite)", () => {
  let repo: DrizzleSpecimenRepository;
  let service: CrossService;
  beforeAll(async () => { const db = await makeDb(); repo = new DrizzleSpecimenRepository(db); service = new CrossService(repo, new WalletService(new InMemoryWalletRepository())); });

  it("carrega fundadores (get)", async () => {
    const p = await repo.get("onca-pintada");
    expect(p?.species).toBe("panthera-onca");
    expect(p?.genotype.loci.A).toBeDefined();
  });

  it("cruza, persiste F1 e reconstrói pedigree do filho", async () => {
    const f1 = await service.execute("owner-db", "JUNIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", seed: "db-1" });
    const ped = await repo.buildPedigree([f1.specimen.id]);
    expect(ped[f1.specimen.id]).toEqual({ id: f1.specimen.id, sire: "onca-pintada", dam: "onca-negra" });
    expect(ped["onca-pintada"]).toBeDefined();
  });

  it("retrocruzamento persiste com F_pedigree = 0.25", async () => {
    // onca-pintada×onca-negra é SAME_SPECIES (sem Haldane), mas o sexo do
    // filho é sorteado — usado como SIRE abaixo, precisa ser Macho.
    // firstSeedWithSex acha a seed certa em vez de fixar "db-2" à mão.
    // Retrocruza à MÃE real (onca-negra, Fêmea) — onca-pintada (Macho, era o
    // pai do f1) não pode ser dam.
    let f1!: Awaited<ReturnType<typeof service.execute>>;
    await firstSeedWithSex(async (seed) => {
      const r = await service.execute("o2", "JUNIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", seed });
      f1 = r;
      return { specimen: { sex: r.engine.sex } };
    }, "M", "db-2");
    const bc = await service.execute("o2", "JUNIOR", { sireId: f1.specimen.id, damId: "onca-negra", method: "BC1", seed: "db-3" });
    expect(bc.engine.fPedigree).toBe(0.25);
    const saved = await repo.get(bc.specimen.id);
    expect(saved?.fPedigree).toBe(0.25);
    expect(saved?.genotype.loci.A).toBeDefined();
  });

  it("determinismo persiste: mesma seed → mesmo cacheKey", async () => {
    const a = await service.execute("u2", "JUNIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", seed: "k" });
    const b = await service.execute("u2", "JUNIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", seed: "k" });
    expect(a.cacheKey).toBe(b.cacheKey);
  });
});
