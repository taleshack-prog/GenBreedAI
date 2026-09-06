/**
 * Testes de unidade do CrossService: fiação correta do motor e paridade
 * anti-P2W (o serviço não varia por tier — ele nem recebe tier).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CrossService } from "../src/cross/cross.service";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { wrightF } from "@genbreedai/engine";

describe("CrossService", () => {
  let repo: InMemorySpecimenRepository;
  let service: CrossService;

  beforeEach(() => {
    repo = new InMemorySpecimenRepository();
    service = new CrossService(repo);
  });

  it("BC1 Delta × Onça Negra → F_pedigree = 0.25 (via motor)", async () => {
    const r = await service.execute("demo", { sireId: "delta", damId: "negra", method: "BC1" });
    expect(r.engine.fPedigree).toBe(0.25);
    // Confere com o cálculo direto do motor sobre o pedigree persistido.
    const ped = await repo.buildPedigree(["delta", "negra"]);
    expect(wrightF(ped, "delta", "negra")).toBe(0.25);
  });

  it("Goldendoodle F1 → F_pedigree = 0 e prole viável", async () => {
    const r = await service.execute("demo", { sireId: "golden", damId: "poodle", method: "F1" });
    expect(r.engine.fPedigree).toBe(0);
    expect(r.engine.phenotype.viable).toBe(true);
  });

  it("determinismo: mesma seed → mesmo cacheKey", async () => {
    const a = await service.execute("u", { sireId: "delta", damId: "negra", method: "BC1", seed: "s1" });
    const b = await service.execute("u", { sireId: "delta", damId: "negra", method: "BC1", seed: "s1" });
    expect(a.cacheKey).toBe(b.cacheKey);
  });

  it("persiste a prole com proveniência (sire/dam) e a associa ao dono", async () => {
    const r = await service.execute("owner-42", { sireId: "delta", damId: "negra", method: "BC1" });
    const saved = await repo.get(r.specimen.id);
    expect(saved?.ownerId).toBe("owner-42");
    expect(saved?.sireId).toBe("delta");
    expect(saved?.damId).toBe("negra");
    expect((await repo.listByOwner("owner-42")).length).toBe(1);
  });

  it("rejeita cruzamento entre packs distintos (400)", async () => {
    await expect(
      service.execute("demo", { sireId: "delta", damId: "golden", method: "F1" }),
    ).rejects.toThrow();
  });

  it("ANTI-P2W: chamadas idênticas produzem resultado idêntico (serviço não vê tier)", async () => {
    // Simula 4 requisições de tiers diferentes: mesma entrada → mesmo resultado.
    const runs = await Promise.all(["FREE", "JUNIOR", "SENIOR", "PHD"].map(() =>
      service.execute("same-user", { sireId: "delta", damId: "negra", method: "BC1", seed: "fixed" }),
    ));
    const ref = runs[0]!;
    for (const r of runs) {
      expect(r.cacheKey).toBe(ref.cacheKey);
      expect(r.engine.fixationIndex).toBe(ref.engine.fixationIndex);
      expect(r.engine.fPedigree).toBe(ref.engine.fPedigree);
    }
    // O serviço execute() tem assinatura (ownerId, dto) — nenhum parâmetro de tier.
    expect(service.execute.length).toBe(2);
  });
});
