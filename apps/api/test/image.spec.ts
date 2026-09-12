import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { ImageJobRepository } from "../src/images/image-job.repository";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { ImageService } from "../src/images/image.service";
import { buildPrompt, traitVector } from "../src/images/prompt";

describe("Pipeline de imagem (TDD §5)", () => {
  let repo: InMemorySpecimenRepository;
  let svc: ImageService;
  beforeEach(() => { delete process.env.FAL_KEY; repo = new InMemorySpecimenRepository(); svc = new ImageService(repo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository())); });

  it("prompt é determinístico e descreve a espécie/traços", async () => {
    const onca = (await repo.get("onca-pintada"))!;
    const p1 = buildPrompt(onca), p2 = buildPrompt(onca);
    expect(p1).toBe(p2);
    expect(p1.toLowerCase()).toContain("jaguar");
    expect(p1).toContain("#0A0E14");
    expect(traitVector(onca).join(" ")).toContain("rosettes");
    expect(p1).toContain("Full-body");
    expect(p1).toContain("Panthera onca");
  });

  it("tigre → traço de listras; guepardo → pintas", async () => {
    expect(traitVector((await repo.get("tigre-bengala"))!).join(" ")).toContain("stripes");
    expect(traitVector((await repo.get("guepardo"))!).join(" ")).toContain("spots");
    expect(traitVector((await repo.get("gato-branco"))!).join(" ")).toContain("white coat");
  });

  it("sem FAL_KEY → modo procedural (APPROVED, sem imageUrl, model=procedural)", async () => {
    const r = await svc.generate("onca-pintada", "FREE");
    expect(r.status).toBe("APPROVED");
    expect(r.model).toBe("procedural");
    expect(r.imageUrl).toBeNull();
    expect(r.cacheKey).toBeTruthy();
  });

  it("getCached retorna estado sem imagem quando não há cache", async () => {
    const r = await svc.getCached("puma");
    expect(r?.imageUrl).toBeNull();
  });

  it("prompt de MISTURA CANINA descreve um CÃO (não felino)", async () => {
    const { buildPrompt } = await import("../src/images/prompt");
    const dogMix = { id:"dm", ownerId:"demo", pack:"canine" as const, species:"boerboel×braco-alemao",
      genotype:{ loci:{ B:["B","b"] as [string,string] }, qtl:{} }, generation:1,
      sireId:"boerboel", damId:"braco-alemao", method:"F1" as const, fPedigree:0, fixationIndex:0, aura:2, cacheKey:null };
    const p = buildPrompt(dogMix);
    expect(p).toContain("mixed-breed domestic dog");
    expect(p).not.toContain("big cat");
  });

  it("cães com fenótipos distintos → prompts DISTINTOS (não o mesmo cão)", async () => {
    const { buildPrompt } = await import("../src/images/prompt");
    const mk = (loci: Record<string, [string,string]>) => ({ id:"d", ownerId:"demo", pack:"canine" as const, species:"canis-familiaris",
      genotype:{ loci, qtl:{} }, generation:1, sireId:null, damId:null, method:"FOUNDER" as const, fPedigree:0, fixationIndex:0, aura:2, cacheKey:null });
    const brindle = buildPrompt(mk({ B:["B","B"], K:["K^br","K^br"], A:["A^y","A^y"], E:["E","E"] }));
    const liver = buildPrompt(mk({ B:["b","b"], K:["k^y","k^y"], A:["a^t","a^t"], E:["E","E"] }));
    expect(brindle).not.toBe(liver);
    expect(brindle).toContain("brindle");
    expect(liver).toContain("tan points");
  });

});
