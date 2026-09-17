/**
 * Script de administração pra regenerar retratos de fundador (bloqueado pro
 * site desde 16/09 — ImageService.generate: force em fundador → 403).
 * Testa a lógica pura (parseArgs/resolveTargets) e o fluxo de main() com
 * process.exit mockado (nunca mata o processo de teste de verdade).
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForbiddenException } from "@nestjs/common";
import { founderSeeds, InMemorySpecimenRepository, type StoredSpecimen } from "../src/specimens/in-memory.repository";
import { ImageJobRepository } from "../src/images/image-job.repository";
import { ImageService, cacheKeyOf } from "../src/images/image.service";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import * as storage from "../src/images/storage";
import { parseArgs, resolveTargets, currentBucket, main } from "../src/images/regenerate-founders";

class ProcessExitError extends Error {
  code: string | number | null | undefined;
  constructor(code?: string | number | null) { super(`process.exit(${code})`); this.code = code; }
}

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
let imgTmpDir: string;
let savedEnv: Record<string, string | undefined>;
let exitSpy: MockInstance<typeof process.exit>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  delete process.env.FAL_KEY;
  delete process.env.DATABASE_URL;
  imgTmpDir = await mkdtemp(join(tmpdir(), "genbreedai-images-"));
  savedEnv = { IMAGE_STORAGE_DIR: process.env.IMAGE_STORAGE_DIR };
  for (const k of R2_VARS) savedEnv[k] = process.env[k];
  process.env.IMAGE_STORAGE_DIR = imgTmpDir;
  for (const k of R2_VARS) delete process.env[k];

  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null): never => { throw new ProcessExitError(code); });
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  exitSpy.mockRestore();
  logSpy.mockRestore();
  errSpy.mockRestore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await rm(imgTmpDir, { recursive: true, force: true });
});

describe("parseArgs / currentBucket — parsing puro", () => {
  it("lê --ids, --apply, --confirm-bucket, --max", () => {
    const a = parseArgs(["--ids=leao,onca-pintada", "--apply", "--confirm-bucket=meu-bucket", "--max=5"]);
    expect(a.ids).toEqual(["leao", "onca-pintada"]);
    expect(a.missing).toBe(false);
    expect(a.apply).toBe(true);
    expect(a.confirmBucket).toBe("meu-bucket");
    expect(a.max).toBe(5);
  });
  it("sem R2_BUCKET → bucket 'local'", () => {
    delete process.env.R2_BUCKET;
    expect(currentBucket()).toBe("local");
  });
  it("com R2_BUCKET → o próprio valor", () => {
    process.env.R2_BUCKET = "meu-bucket-r2";
    expect(currentBucket()).toBe("meu-bucket-r2");
    delete process.env.R2_BUCKET;
  });
});

describe("resolveTargets — lógica pura de seleção", () => {
  const all = founderSeeds();

  it("nem --ids nem --missing → erro", async () => {
    const r = await resolveTargets({ ids: null, missing: false }, all);
    expect(r.ok).toBe(false);
  });
  it("--ids e --missing juntos → erro", async () => {
    const r = await resolveTargets({ ids: ["leao"], missing: true }, all);
    expect(r.ok).toBe(false);
  });
  it("id desconhecido → erro, listando o id", async () => {
    const r = await resolveTargets({ ids: ["leao", "id-que-nao-existe"], missing: false }, all);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("id-que-nao-existe");
  });
  it("--ids válidos → devolve os espécimes na mesma ordem pedida", async () => {
    const r = await resolveTargets({ ids: ["onca-pintada", "leao"], missing: false }, all);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets.map((t) => t.id)).toEqual(["onca-pintada", "leao"]);
  });
});

describe("main() — id desconhecido aborta ANTES de qualquer ação", () => {
  it("nem dry-run nem apply geram/apagam nada", async () => {
    const removeSpy = vi.spyOn(storage, "remove");
    const storeSpy = vi.spyOn(storage, "store");
    await expect(main(["--ids=id-que-nao-existe"])).rejects.toBeInstanceOf(ProcessExitError);
    expect(removeSpy).not.toHaveBeenCalled();
    expect(storeSpy).not.toHaveBeenCalled();
  });
});

describe("main() — DRY-RUN nunca chama remove nem o provider (nunca gera/apaga)", () => {
  it("--ids=leao sem --apply: só lê, nada é gravado", async () => {
    const removeSpy = vi.spyOn(storage, "remove");
    const storeSpy = vi.spyOn(storage, "store");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await main(["--ids=leao"]);
    expect(removeSpy).not.toHaveBeenCalled();
    expect(storeSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("main() — --apply sem --confirm-bucket aborta", () => {
  it("não grava nada", async () => {
    const removeSpy = vi.spyOn(storage, "remove");
    const storeSpy = vi.spyOn(storage, "store");
    await expect(main(["--ids=leao", "--apply"])).rejects.toBeInstanceOf(ProcessExitError);
    expect(removeSpy).not.toHaveBeenCalled();
    expect(storeSpy).not.toHaveBeenCalled();
  });
  it("--confirm-bucket com valor ERRADO também aborta", async () => {
    await expect(main(["--ids=leao", "--apply", "--confirm-bucket=bucket-errado"])).rejects.toBeInstanceOf(ProcessExitError);
  });
});

describe("main() — --missing nunca apaga retrato existente", () => {
  it("fundador com retrato já gravado fica de fora e intacto", async () => {
    const founder = founderSeeds().find((f) => f.id === "gato-branco")!;
    const key = cacheKeyOf(founder);
    await storage.store(key, Buffer.from("retrato-ja-existente"));
    const before = await storage.stat(key);

    const removeSpy = vi.spyOn(storage, "remove");
    // --max pequeno: só pra passar da trava de >10 sem depender de quantos
    // fundadores estão "sem retrato" no total (147 dos 148, sem FAL_KEY
    // ninguém grava nada mesmo — modo procedural nunca chama store()).
    await main(["--missing", "--apply", "--confirm-bucket=local", "--max=3"]);

    expect(removeSpy).not.toHaveBeenCalled();
    const after = await storage.stat(key);
    expect(after?.version).toBe(before?.version);
  });
});

describe("ImageService.regenerateFounderAdmin — recusa espécime que não é fundador", () => {
  it("method !== FOUNDER → ForbiddenException, sem apagar nada", async () => {
    const repo = new InMemorySpecimenRepository();
    const svc = new ImageService(repo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
    const removeSpy = vi.spyOn(storage, "remove");
    const naoFundador: StoredSpecimen = {
      id: "filhote-de-alguem", ownerId: "user-x", pack: "feline", species: "felis-catus",
      genotype: { loci: {}, qtl: {} }, generation: 1, sireId: "gato-branco", damId: "gato-tabby",
      method: "F1", fPedigree: 0, fixationIndex: 0, aura: 2, cacheKey: null,
      sex: "M", fertility: null, haldaneStatus: null,
    };
    await expect(svc.regenerateFounderAdmin(naoFundador, "PHD")).rejects.toBeInstanceOf(ForbiddenException);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("fundador de verdade → aceito (não lança)", async () => {
    const repo = new InMemorySpecimenRepository();
    const svc = new ImageService(repo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
    const founder = founderSeeds().find((f) => f.id === "gato-preto")!;
    const r = await svc.regenerateFounderAdmin(founder, "PHD");
    expect(r.cacheKey).toBeTruthy();
  });
});
