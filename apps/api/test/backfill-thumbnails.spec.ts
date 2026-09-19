/**
 * Backfill de miniaturas (ADR-0027): dry-run só conta; --apply gera SÓ as que
 * faltam, sem tocar no original nem chamar a fal.ai; uma falha não derruba o
 * lote. Disco local em pasta temporária, codificador falso (sem `sharp`).
 * Não importa `main.ts` nem o CLI (nada de `.env`/R2 reais).
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, currentBucket, runBackfill } from "../src/images/backfill-thumbnails";
import { setThumbnailEncoderForTesting } from "../src/images/thumbnail";
import { store, statThumb, stat } from "../src/images/storage";

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
let tmp: string;
let savedEnv: Record<string, string | undefined>;
let warn: MockInstance<typeof console.warn>;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genbreedai-backfill-"));
  savedEnv = { IMAGE_STORAGE_DIR: process.env.IMAGE_STORAGE_DIR };
  for (const k of R2_VARS) savedEnv[k] = process.env[k];
  process.env.IMAGE_STORAGE_DIR = tmp;
  for (const k of R2_VARS) delete process.env[k];
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  warn.mockRestore();
  setThumbnailEncoderForTesting(null);
  for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await rm(tmp, { recursive: true, force: true });
});

/** Grava originais SEM miniatura (como os retratos anteriores à ADR-0027): o codificador falha de propósito. */
async function seedOldPortraits(keys: string[]) {
  setThumbnailEncoderForTesting(async () => { throw new Error("sem miniatura (retrato antigo)"); });
  for (const k of keys) await store(k, Buffer.from(`png-${k}`));
  setThumbnailEncoderForTesting(null);
}

describe("parseArgs / currentBucket", () => {
  it("dry-run por padrão; --apply, --confirm-bucket e --max lidos", () => {
    expect(parseArgs([])).toEqual({ apply: false, confirmBucket: undefined, max: undefined, maxRaw: undefined });
    expect(parseArgs(["--apply", "--confirm-bucket=genbreed-images", "--max=5"])).toEqual({
      apply: true, confirmBucket: "genbreed-images", max: 5, maxRaw: "5",
    });
  });
  it("sem R2_BUCKET o bucket é 'local'", () => { expect(currentBucket()).toBe("local"); });
});

describe("runBackfill", () => {
  it("DRY-RUN: conta quantos estão sem miniatura e não grava nada", async () => {
    await seedOldPortraits(["k1", "k2", "k3"]);
    const s = await runBackfill({ apply: false }, () => {});
    expect(s).toMatchObject({ total: 3, semMiniatura: 3, processados: 0, gerados: 0 });
    for (const k of ["k1", "k2", "k3"]) expect(await statThumb(k)).toBeNull();
  });

  it("--apply gera a miniatura só dos que faltam; NÃO toca nos originais; idempotente", async () => {
    await seedOldPortraits(["k1", "k2"]);
    setThumbnailEncoderForTesting(async () => Buffer.from("jpeg-fake"));
    await store("k3", Buffer.from("png-k3")); // este já nasce com miniatura
    const before = await stat("k1");

    const s = await runBackfill({ apply: true }, () => {});
    expect(s).toMatchObject({ total: 3, semMiniatura: 2, processados: 2, gerados: 2 });
    expect(s.falhas).toEqual([]);
    for (const k of ["k1", "k2", "k3"]) expect(await statThumb(k)).not.toBeNull();
    expect(await readFile(join(tmp, "k1.png"))).toEqual(Buffer.from("png-k1")); // original intacto
    expect((await stat("k1"))!.version).toBe(before!.version);

    const again = await runBackfill({ apply: true }, () => {});
    expect(again).toMatchObject({ total: 3, semMiniatura: 0, processados: 0, gerados: 0 });
  });

  it("--max limita a rodada; o resto fica pra próxima", async () => {
    await seedOldPortraits(["k1", "k2", "k3"]);
    setThumbnailEncoderForTesting(async () => Buffer.from("jpeg-fake"));
    const s = await runBackfill({ apply: true, max: 2 }, () => {});
    expect(s).toMatchObject({ total: 3, semMiniatura: 3, processados: 2, gerados: 2 });
    const rest = await runBackfill({ apply: false }, () => {});
    expect(rest.semMiniatura).toBe(1);
  });

  it("um retrato que falha não derruba o lote: vira falha registrada e os outros seguem", async () => {
    await seedOldPortraits(["ok-1", "ruim", "ok-2"]);
    setThumbnailEncoderForTesting(async (input) => {
      if (input.toString() === "png-ruim") throw new Error("imagem ilegível");
      return Buffer.from("jpeg-fake");
    });
    const s = await runBackfill({ apply: true }, () => {});
    expect(s.gerados).toBe(2);
    expect(s.falhas).toEqual([{ cacheKey: "ruim", message: "imagem ilegível" }]);
    expect(await statThumb("ruim")).toBeNull();
    expect(await stat("ruim")).not.toBeNull(); // original continua lá
  });
});
