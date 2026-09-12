import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { CrossService } from "../src/cross/cross.service";
import { GenomeService } from "../src/genome/genome.service";

describe("Genoma detalhado (TDD §1.3/§8)", () => {
  let repo: InMemorySpecimenRepository; let cross: CrossService; let genome: GenomeService;
  beforeEach(() => { repo = new InMemorySpecimenRepository(); cross = new CrossService(repo, new WalletService(new InMemoryWalletRepository())); genome = new GenomeService(repo); });

  it("fundador → F=0, sem caminhos, linhagem só ele", async () => {
    const g = await genome.get("onca-pintada", "PHD");
    expect(g.fExplain.total).toBe(0);
    expect(g.lineage?.sire).toBeNull();
    expect(g.phenotype.loci.P).toBe("rosetas");
  });

  it("F2 de irmãos → F=0.25 decomposto por 2 avós", async () => {
    const f1 = await cross.execute("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", seed: "s" });
    // dois irmãos F1
    const a = await cross.execute("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", seed: "x" });
    const b = await cross.execute("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", seed: "y" });
    const f2 = await cross.execute("demo", "SENIOR", { sireId: a.specimen.id, damId: b.specimen.id, method: "F2", seed: "z" });
    const g = await genome.get(f2.specimen.id, "PHD");
    expect(g.fExplain.total).toBe(0.25);
    expect(new Set(g.fExplain.paths.map((p) => p.ancestor)).size).toBe(2); // onca-pintada + onca-negra
    void f1;
  });

  it("origem dos alelos: rastreia de onde vem cada alelo na linhagem", async () => {
    const f1 = await cross.execute("demo", "JUNIOR", { sireId: "onca-pintada", damId: "leao", method: "F1", seed: "s" });
    const g = await genome.get(f1.specimen.id, "PHD");
    const pSource = g.alleleSources.find((x) => x.locus === "P" && x.allele === "P^r");
    expect(pSource?.sources.some((s) => s.includes("onca-pintada"))).toBe(true);
  });
});
