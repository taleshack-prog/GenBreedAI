/**
 * Retrato incluído no cruzamento (ADR-0019): todo cruzamento já vem com 1
 * retrato de IA, sem cota nem crédito. `IMAGE_STORAGE_DIR` temporária, mesmo
 * padrão dos demais testes de imagem.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForbiddenException } from "@nestjs/common";
import { InMemorySpecimenRepository, type StoredSpecimen } from "../src/specimens/in-memory.repository";
import { ImageJobRepository } from "../src/images/image-job.repository";
import { ImageService } from "../src/images/image.service";
import { ImageController } from "../src/images/image.controller";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { CrossService } from "../src/cross/cross.service";
import { TierService } from "../src/billing/tier.service";

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
let imgTmpDir: string;
let savedEnv: Record<string, string | undefined>;

function ownCub(overrides: Partial<StoredSpecimen> = {}): StoredSpecimen {
  return {
    id: "meu-filhote", ownerId: "user-1", pack: "feline", species: "felis-catus",
    genotype: { loci: { A: ["a", "a"] }, qtl: {} }, generation: 1, sireId: "gato-branco", damId: "gato-tabby",
    method: "F1", fPedigree: 0, fixationIndex: 0, aura: 2, cacheKey: "cache-do-filhote",
    sex: "M", fertility: null, haldaneStatus: null, includedPortrait: true,
    ...overrides,
  };
}

function fetchMock() {
  return vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("https://fal.run/")) {
      return new Response(JSON.stringify({ images: [{ url: "https://fake.test/img.png" }] }), { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
  });
}

beforeEach(async () => {
  delete process.env.FAL_KEY;
  delete process.env.DATABASE_URL;
  imgTmpDir = await mkdtemp(join(tmpdir(), "genbreedai-images-"));
  savedEnv = { IMAGE_STORAGE_DIR: process.env.IMAGE_STORAGE_DIR };
  for (const k of R2_VARS) savedEnv[k] = process.env[k];
  process.env.IMAGE_STORAGE_DIR = imgTmpDir;
  for (const k of R2_VARS) delete process.env[k];
});
afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.FAL_KEY;
  for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await rm(imgTmpDir, { recursive: true, force: true });
});

describe("POST /specimens/:id/image — retrato incluído (ADR-0019)", () => {
  it("gerado sem cota nem crédito (FREE, cota mensal 0) e marca included_portrait = false", async () => {
    process.env.FAL_KEY = "test-fake-key";
    vi.stubGlobal("fetch", fetchMock());

    const repo = new InMemorySpecimenRepository();
    await repo.save(ownCub());
    const quota = new ImageQuotaService();
    const images = new ImageService(repo, new ImageJobRepository(), quota, new WalletService(new InMemoryWalletRepository()));
    const tier = { resolve: async () => "FREE" } as unknown as TierService;
    const controller = new ImageController(images, tier);

    const r = await controller.create({ id: "user-1", tier: "FREE" }, "meu-filhote", {});
    expect(r.imageUrl).toBeTruthy();
    expect(await quota.used("user-1")).toBe(0); // FREE tem cota mensal 0 — se tivesse cobrado, isso já falharia

    const updated = await repo.get("meu-filhote");
    expect(updated?.includedPortrait).toBe(false);
  });

  it("2ª tentativa (retrato incluído já usado) cai na regra normal: FREE sem cota nem crédito → 403", async () => {
    process.env.FAL_KEY = "test-fake-key";
    vi.stubGlobal("fetch", fetchMock());

    const repo = new InMemorySpecimenRepository();
    await repo.save(ownCub({ includedPortrait: false })); // já usado antes
    const images = new ImageService(repo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
    const tier = { resolve: async () => "FREE" } as unknown as TierService;
    const controller = new ImageController(images, tier);

    await expect(controller.create({ id: "user-1", tier: "FREE" }, "meu-filhote", {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("force=true NUNCA usa o retrato incluído, mesmo com included_portrait ainda true", async () => {
    const repo = new InMemorySpecimenRepository();
    await repo.save(ownCub()); // includedPortrait: true
    const images = new ImageService(repo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
    const tier = { resolve: async () => "PHD" } as unknown as TierService; // PHD: dono, força regeneração permitida
    const controller = new ImageController(images, tier);

    await controller.create({ id: "user-1", tier: "PHD" }, "meu-filhote", { force: true });
    // Regenerar não passou pelo caminho do retrato incluído — a flag continua true.
    const updated = await repo.get("meu-filhote");
    expect(updated?.includedPortrait).toBe(true);
  });
});

describe("CrossService.execute — falha no retrato incluído NÃO desfaz o cruzamento", () => {
  it("mesmo se generateForSpecimen rejeitar, o cruzamento retorna normalmente", async () => {
    const repo = new InMemorySpecimenRepository();
    const wallet = new WalletService(new InMemoryWalletRepository());
    const brokenImages = {
      generateForSpecimen: vi.fn().mockRejectedValue(new Error("fal.ai fora do ar")),
    } as unknown as ImageService;
    const cross = new CrossService(repo, wallet, brokenImages);

    const r = await cross.execute("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    expect(r.specimen.id).toBeTruthy();
    expect(r.specimen.includedPortrait).toBe(true); // ninguém conseguiu reivindicar — segue disponível
  });

  it("sem ImageService injetado (compatibilidade com testes antigos, 2 args) o cruzamento funciona igual", async () => {
    const repo = new InMemorySpecimenRepository();
    const wallet = new WalletService(new InMemoryWalletRepository());
    const cross = new CrossService(repo, wallet); // sem o 3º argumento
    const r = await cross.execute("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    expect(r.specimen.id).toBeTruthy();
    expect(r.specimen.includedPortrait).toBe(true);
  });
});
