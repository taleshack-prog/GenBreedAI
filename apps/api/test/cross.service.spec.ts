import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { describe, it, expect, beforeEach } from "vitest";
import { CrossService } from "../src/cross/cross.service";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { wrightF } from "@genbreedai/engine";

describe("CrossService (TDD B/K/M + gate por tier)", () => {
  let repo: InMemorySpecimenRepository;
  let svc: CrossService;
  beforeEach(() => { repo = new InMemorySpecimenRepository(); svc = new CrossService(repo, new WalletService(new InMemoryWalletRepository())); });

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

  it("OPÇÕES: Senior vê top-6 e PODE escolher; Free não escolhe", async () => {
    const senior = await svc.options("SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    expect(senior.canChoose).toBe(true);
    expect(senior.maxOptions).toBe(6);
    expect(senior.options.length).toBeGreaterThan(0);
    const free = await svc.options("FREE", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    expect(free.canChoose).toBe(false);
    // ANTI-P2W: mesmas probabilidades independentemente do tier
    expect(free.options[0]!.prob).toBe(senior.options[0]!.prob);
  });

  it("SELEÇÃO: Senior escolhe uma opção → filhote tem o genótipo escolhido", async () => {
    const opts = await svc.options("SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    const chosen = opts.options[0]!;
    const r = await svc.execute("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", choiceKey: chosen.key });
    // o genótipo do filhote corresponde ao escolhido (loco A)
    expect(r.engine.genotype.loci.A).toEqual(chosen.genotype.loci.A);
  });

  it("SELEÇÃO inválida → 400", async () => {
    await expect(svc.execute("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", choiceKey: "chave-invalida" }))
      .rejects.toThrow();
  });

  it("PhD vê mais opções que Senior (top-12)", async () => {
    const phd = await svc.options("PHD", { sireId: "gato-tabby", damId: "gato-siames", method: "F1" });
    expect(phd.maxOptions).toBe(12);
  });

  it("CÃO × CÃO (raças) NÃO é interespecífico → fértil (sem Haldane) e vira CÃO", async () => {
    const r = await svc.execute("demo", "SENIOR", { sireId: "boerboel", damId: "braco-alemao", method: "F1" });
    expect(r.engine.fertility.haldaneSterile).toBe(false);
    expect(r.engine.fertility.score).toBeGreaterThan(0);
    expect(r.specimen.pack).toBe("canine");
    expect(r.specimen.species).toContain("×"); // mistura de raças
  });

  it("Braço Alemão tem roan → prole herda ticking (pintas do Pointer)", async () => {
    // F1 Boerboel × Braço: R/r (roan dominante) → ticking presente
    const r = await svc.execute("demo", "SENIOR", { sireId: "boerboel", damId: "braco-alemao", method: "F1", seed: "t" });
    expect(r.engine.genotype.loci.R).toContain("R"); // herdou o alelo roan do Braço
    expect(r.engine.phenotype.loci.R).toBe("roan");
  });

  it("nome de híbrido MULTI-ESPÉCIE inclui todos os ancestrais (não some o 3º)", async () => {
    const { speciesInfo } = await import("@genbreedai/shared");
    const info = speciesInfo("leptailurus-serval×panthera-onca×panthera-tigris-albino");
    expect(info.common).toContain("Serval");
    expect(info.common).toContain("Onça-pintada");
    expect(info.common).toContain("Tigre-albino");     // antes sumia
    // combineSpecies dedupe: cruzar hibrido com um ancestral não repete
    const r = await svc.execute("demo", "PHD", { sireId: "onca-pintada", damId: "puma", method: "F1", seed: "z" });
    const back = await svc.execute("demo", "PHD", { sireId: r.specimen.id, damId: "onca-pintada", method: "BC1", seed: "z2" });
    expect(back.specimen.species.split("×").length).toBe(new Set(back.specimen.species.split("×")).size); // sem duplicatas
  });
});
