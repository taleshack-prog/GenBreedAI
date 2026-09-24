/**
 * `thumbUrl` nas respostas que alimentam as LISTAS da web (ADR-0037): `GET /specimens/:id/image` (`ImageService.getCached`) e a lista da
 * incubadora. Aditivo: `imageUrl` continua igual. Sem miniatura → `thumbUrl: null` (a web cai no original). Disco local temporário, sem R2 nem
 * rede; não importa `main.ts` (não carrega o `.env`).
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setThumbnailEncoderForTesting } from "../src/images/thumbnail";
import { store, thumbUrlIfExists } from "../src/images/storage";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { ImageService, cacheKeyOf } from "../src/images/image.service";
import { ImageJobRepository } from "../src/images/image-job.repository";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
let tmp: string;
let savedEnv: Record<string, string | undefined>;
let warn: MockInstance<typeof console.warn>;
const ORIGINAL = Buffer.from("png-fake");
const THUMB = Buffer.from("jpeg-fake");

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genbreedai-thumb-url-"));
  savedEnv = { IMAGE_STORAGE_DIR: process.env.IMAGE_STORAGE_DIR, FAL_KEY: process.env.FAL_KEY };
  for (const k of R2_VARS) savedEnv[k] = process.env[k];
  process.env.IMAGE_STORAGE_DIR = tmp;
  delete process.env.FAL_KEY;
  for (const k of R2_VARS) delete process.env[k];
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  warn.mockRestore();
  setThumbnailEncoderForTesting(null);
  for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await rm(tmp, { recursive: true, force: true });
});

const setup = () => {
  const repo = new InMemorySpecimenRepository();
  const svc = new ImageService(repo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
  return { repo, svc };
};

describe("ImageService.getCached — thumbUrl", () => {
  it("retrato COM miniatura: thumbUrl aponta para <cacheKey>_thumb.jpg?v=…, e imageUrl segue sendo o original", async () => {
    const { repo, svc } = setup();
    const key = cacheKeyOf((await repo.get("gato-tabby"))!);
    setThumbnailEncoderForTesting(async () => THUMB);
    await store(key, ORIGINAL);
    const r = (await svc.getCached("gato-tabby", "demo", "FREE"))!;
    expect(r.imageUrl).toContain(`/${key}.png?v=`);
    expect(r.thumbUrl).toContain(`/${key}_thumb.jpg?v=`);
  });

  it("retrato SEM miniatura (anterior à ADR-0027 ou geração falhou): thumbUrl null e imageUrl presente — a web cai no original", async () => {
    const { repo, svc } = setup();
    const key = cacheKeyOf((await repo.get("gato-tabby"))!);
    setThumbnailEncoderForTesting(async () => { throw new Error("sem sharp"); });
    await store(key, ORIGINAL);
    const r = (await svc.getCached("gato-tabby", "demo", "FREE"))!;
    expect(r.imageUrl).toContain(`/${key}.png?v=`);
    expect(r.thumbUrl).toBeNull();
  });

  it("sem retrato nenhum: imageUrl null e thumbUrl ausente (nada a mostrar)", async () => {
    const { svc } = setup();
    const r = (await svc.getCached("gato-tabby", "demo", "FREE"))!;
    expect(r.imageUrl).toBeNull();
    expect(r.thumbUrl ?? null).toBeNull();
  });

  it("thumbUrlIfExists: existe → URL com ?v=; não existe → null (nunca lança)", async () => {
    setThumbnailEncoderForTesting(async () => THUMB);
    await store("chave-x", ORIGINAL);
    expect(await thumbUrlIfExists("chave-x")).toContain("/chave-x_thumb.jpg?v=");
    expect(await thumbUrlIfExists("chave-inexistente")).toBeNull();
  });
});
