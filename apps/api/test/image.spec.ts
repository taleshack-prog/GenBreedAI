import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { ImageJobRepository } from "../src/images/image-job.repository";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { ImageService } from "../src/images/image.service";
import { buildPrompt, traitVector } from "../src/images/prompt";
import { SPECIES_INFO } from "@genbreedai/shared";

// storage.ts local (sem R2) grava/lê em IMAGE_STORAGE_DIR — em teste, SEMPRE
// uma pasta temporária própria (nunca apps/web/public/assets/generated, que
// tem arquivos reais: em paralelo ou não, dois testes/arquivos usando a
// mesma pasta real colidem entre si e com esse conteúdo já existente).
const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
let imgTmpDir: string;
let savedEnv: Record<string, string | undefined>;

describe("Pipeline de imagem (TDD §5)", () => {
  let repo: InMemorySpecimenRepository;
  let svc: ImageService;
  beforeEach(async () => {
    delete process.env.FAL_KEY;
    imgTmpDir = await mkdtemp(join(tmpdir(), "genbreedai-images-"));
    savedEnv = { IMAGE_STORAGE_DIR: process.env.IMAGE_STORAGE_DIR };
    for (const k of R2_VARS) savedEnv[k] = process.env[k];
    process.env.IMAGE_STORAGE_DIR = imgTmpDir;
    for (const k of R2_VARS) delete process.env[k];
    repo = new InMemorySpecimenRepository();
    svc = new ImageService(repo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
  });
  afterEach(async () => {
    for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await rm(imgTmpDir, { recursive: true, force: true });
  });

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
    // payerId "u1" (não é o dono "demo") + tier PHD — prova que fundador
    // gera normalmente pra qualquer usuário (ver image-access.spec.ts pro
    // resto da regra de acesso/cota).
    const r = await svc.generate("onca-pintada", "u1", "PHD");
    expect(r.status).toBe("APPROVED");
    expect(r.model).toBe("procedural");
    expect(r.imageUrl).toBeNull();
    expect(r.cacheKey).toBeTruthy();
  });

  it("getCached retorna estado sem imagem quando não há cache", async () => {
    const r = await svc.getCached("puma", "u1", "PHD");
    expect(r?.imageUrl).toBeNull();
  });

  it("prompt de MISTURA CANINA descreve um CÃO (não felino)", async () => {
    const { buildPrompt } = await import("../src/images/prompt");
    const dogMix = { id:"dm", ownerId:"demo", pack:"canine" as const, species:"boerboel×braco-alemao",
      genotype:{ loci:{ B:["B","b"] as [string,string] }, qtl:{} }, generation:1,
      sireId:"boerboel", damId:"braco-alemao", method:"F1" as const, fPedigree:0, fixationIndex:0, aura:2, cacheKey:null,
      sex: null, fertility: null, haldaneStatus: null };
    const p = buildPrompt(dogMix);
    expect(p).toContain("mixed-breed domestic dog");
    expect(p).not.toContain("big cat");
  });

  it("cães com fenótipos distintos → prompts DISTINTOS (não o mesmo cão)", async () => {
    const { buildPrompt } = await import("../src/images/prompt");
    const mk = (loci: Record<string, [string,string]>) => ({ id:"d", ownerId:"demo", pack:"canine" as const, species:"canis-familiaris",
      genotype:{ loci, qtl:{} }, generation:1, sireId:null, damId:null, method:"FOUNDER" as const, fPedigree:0, fixationIndex:0, aura:2, cacheKey:null,
      sex: null, fertility: null, haldaneStatus: null });
    const brindle = buildPrompt(mk({ B:["B","B"], K:["K^br","K^br"], A:["A^y","A^y"], E:["E","E"] }));
    const liver = buildPrompt(mk({ B:["b","b"], K:["k^y","k^y"], A:["a^t","a^t"], E:["E","E"] }));
    expect(brindle).not.toBe(liver);
    expect(brindle).toContain("brindle");
    expect(liver).toContain("tan points");
  });

  it("BUGFIX (produção): híbrido tigre-branco×leão macho com juba parcial nomeia as duas espécies e a juba, nunca 'adult Bengal tiger'", async () => {
    const { buildPrompt } = await import("../src/images/prompt");
    const hybrid = {
      id: "hb", ownerId: "demo", pack: "feline" as const, species: "panthera-tigris-branco×panthera-leo",
      genotype: { loci: { P: ["P^m", "P^m"] as [string, string], Ma: ["Ma", "ma"] as [string, string] }, qtl: {} },
      generation: 1, sireId: "tigre-branco", damId: "leao", method: "F1" as const,
      fPedigree: 0, fixationIndex: 0, aura: 2, cacheKey: null,
      sex: "M" as const, fertility: null, haldaneStatus: null,
    };
    const p = buildPrompt(hybrid);
    // As duas espécies-mãe, nomeadas — não um "híbrido genérico" sem âncora.
    expect(p).toContain("Tigre-branco");
    expect(p).toContain("Leão");
    // A juba (fenótipo calculado) aparece — o traço de leão não pode sumir.
    expect(p.toLowerCase()).toContain("mane");
    // NUNCA o descritor de espécie PURA (travaria o resultado num tigre comum).
    expect(p).not.toContain("adult Bengal tiger");
    expect(p).not.toContain("unmistakably a lion");
  });

  it("híbrido com 3+ espécies (canino) nomeia todas, na ordem do species", async () => {
    const { buildPrompt } = await import("../src/images/prompt");
    const triHybrid = {
      id: "tri", ownerId: "demo", pack: "canine" as const, species: "boerboel×braco-alemao×dobermann",
      genotype: { loci: { B: ["B", "B"] as [string, string] }, qtl: {} }, generation: 1,
      sireId: "x", damId: "y", method: "F1" as const, fPedigree: 0, fixationIndex: 0, aura: 2, cacheKey: null,
      sex: null, fertility: null, haldaneStatus: null,
    };
    const p = buildPrompt(triHybrid);
    expect(p).toContain("mixed-breed domestic dog");
    expect(p).toContain("Boerboel");
    expect(p).toContain("Braço Alemão");
    expect(p).toContain("Dobermann");
    // Ordem de aparição em `species` preservada — "A, B and C", não só 2 dos 3.
    const iBoerboel = p.indexOf("Boerboel");
    const iBraco = p.indexOf("Braço Alemão");
    const iDobermann = p.indexOf("Dobermann");
    expect(iBoerboel).toBeLessThan(iBraco);
    expect(iBraco).toBeLessThan(iDobermann);
  });

  it("espécime PURO (não-híbrido): prompt inalterado por este bugfix — tigre-branco sozinho continua citando o descritor de espécie pura", async () => {
    const tigreBranco = (await repo.get("tigre-branco"))!;
    const p = buildPrompt(tigreBranco);
    expect(p).toContain("Tigre-branco");
    expect(p).toContain(SPECIES_INFO["panthera-tigris-branco"]!.descriptor);
  });

  it("leoa (leao-femea): prompt nunca menciona juba/'Leão'/macho; leão: prompt menciona juba", async () => {
    const leaoFemea = (await repo.get("leao-femea"))!;
    const leao = (await repo.get("leao"))!;
    const pFemea = buildPrompt(leaoFemea);
    const pMacho = buildPrompt(leao);
    expect(pFemea).not.toContain("mane");
    expect(pFemea).not.toContain("Leão");
    // \bmale\b (limite de palavra) — não "male " literal: "female " CONTÉM
    // "male " como substring ("fe" + "male "), e a fêmea precisa dizer
    // "female" no prompt; \b evita esse falso positivo.
    expect(pFemea).not.toMatch(/\bmale\b/i);
    expect(pFemea).toContain("Leoa");
    expect(pFemea).toContain("female");
    expect(pMacho).toContain("mane");
  });

});
