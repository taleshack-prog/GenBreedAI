import { describe, it, expect, beforeEach } from "vitest";
import { CrossService } from "../src/cross/cross.service";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { wrightF } from "@genbreedai/engine";

describe("CrossService (TDD B/K/M + gate por tier)", () => {
  let repo: InMemorySpecimenRepository;
  let svc: CrossService;
  beforeEach(() => { repo = new InMemorySpecimenRepository(); svc = new CrossService(repo); });

  it("FREE cruza Panthera×Panthera (intraespécie) e segrega melanismo", async () => {
    const r = await svc.execute("demo", "FREE", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    expect(r.engine.phenotype.viable).toBe(true);
    expect(r.engine.fPedigree).toBe(0);
    expect(r.specimen.pack).toBe("feline");
  });

  it("FREE é BLOQUEADO no interespecífico (Puma×Panthera) → 403", async () => {
    await expect(svc.execute("demo", "FREE", { sireId: "puma", damId: "onca-pintada", method: "F1" }))
      .rejects.toThrow(/interespec/i);
  });

  it("JUNIOR libera interespecífico felino (Pumajaguar F1)", async () => {
    const r = await svc.execute("demo", "JUNIOR", { sireId: "puma", damId: "onca-pintada", method: "F1" });
    expect(r.engine.phenotype.viable).toBe(true);
    expect(r.specimen.species).toContain("×");
  });

  it("FREE/JUNIOR são BLOQUEADOS em caninos → 403 (Senior+)", async () => {
    await expect(svc.execute("demo", "JUNIOR", { sireId: "boerboel", damId: "braco-alemao", method: "F1" }))
      .rejects.toThrow(/SENIOR/);
  });

  it("SENIOR cruza caninos (Boerpointer F1)", async () => {
    const r = await svc.execute("demo", "SENIOR", { sireId: "boerboel", damId: "braco-alemao", method: "F1" });
    expect(r.engine.phenotype.viable).toBe(true);
    expect(r.specimen.pack).toBe("canine");
  });

  it("retrocruzamento → F_pedigree = 0.25", async () => {
    const f1 = await svc.execute("demo", "JUNIOR", { sireId: "puma", damId: "onca-pintada", method: "F1", seed: "s1" });
    const bc = await svc.execute("demo", "JUNIOR", { sireId: f1.specimen.id, damId: "onca-pintada", method: "BC1", seed: "s2" });
    expect(bc.engine.fPedigree).toBe(0.25);
    const ped = await repo.buildPedigree([f1.specimen.id, "onca-negra-1"]);
    expect(wrightF(ped, f1.specimen.id, "onca-pintada")).toBe(0.25);
  });

  it("ANTI-P2W: mesma entrada → resultado idêntico entre tiers permitidos", async () => {
    const a = await svc.execute("u", "JUNIOR", { sireId: "puma", damId: "onca-pintada", method: "F1", seed: "fix" });
    const b = await svc.execute("u", "PHD", { sireId: "puma", damId: "onca-pintada", method: "F1", seed: "fix" });
    expect(a.cacheKey).toBe(b.cacheKey);
    expect(a.engine.fixationIndex).toBe(b.engine.fixationIndex);
  });
});
