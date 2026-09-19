/**
 * Miniatura do retrato (ADR-0027): 600×600 JPEG < 200 KB gravada ao lado do
 * original (`<cacheKey>_thumb.jpg`), URL com `?v=` no mesmo padrão, exposta em
 * `GET /public/specimens/:id` como `thumbUrl` (ou `null`), e a garantia central:
 * falha na miniatura NUNCA impede o retrato de ser salvo.
 *
 * `sharp` ainda não é dependência declarada da API (instalação à parte). Os
 * testes que precisam DELE de verdade (tamanho real, dimensões) só rodam se ele
 * estiver instalado — o resto usa um codificador falso (`setThumbnailEncoderForTesting`)
 * e roda sempre. Disco local (IMAGE_STORAGE_DIR temporário), sem R2 nem rede;
 * este arquivo não importa `main.ts` (não carrega o `.env` local).
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeThumbnail, setThumbnailEncoderForTesting, THUMB_MAX_BYTES, THUMB_SIZE, THUMB_QUALITIES,
} from "../src/images/thumbnail";
import { store, stat, statThumb, remove, publicUrl, thumbUrl } from "../src/images/storage";
import { PublicSpecimenController } from "../src/specimens/public-specimen.controller";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { cacheKeyOf } from "../src/images/image.service";

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
let tmp: string;
let savedEnv: Record<string, string | undefined>;
let warn: MockInstance<typeof console.warn>;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genbreedai-thumb-"));
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

const FAKE_ORIGINAL = Buffer.from("png-fake-do-retrato-original");
const FAKE_THUMB = Buffer.from("jpeg-fake-da-miniatura");

// ── sharp de verdade (só se instalado) ──────────────────────────────────────
type Sharp = (input: Buffer | Uint8Array, options?: unknown) => {
  png(): { toBuffer(): Promise<Buffer> };
  metadata(): Promise<{ width?: number; height?: number; format?: string }>;
};
async function loadRealSharp(): Promise<Sharp | null> {
  try { const name = "sharp"; const m = await import(name); return (m.default ?? m) as Sharp; } catch { return null; }
}
const realSharp = await loadRealSharp();

describe.skipIf(!realSharp)("makeThumbnail com sharp de verdade (roda só com sharp instalado)", () => {
  it("PNG 1024×1024 → JPEG 600×600 abaixo de 200 KB (e menor que o original)", async () => {
    const W = 1024;
    const raw = Buffer.alloc(W * W * 3);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const tex = 10 * Math.sin(x / 9) * Math.cos(y / 6); // textura suave, determinística (sem ruído aleatório)
      raw[i] = Math.max(0, Math.min(255, (x * 255) / W + tex));
      raw[i + 1] = Math.max(0, Math.min(255, (y * 255) / W + tex));
      raw[i + 2] = Math.max(0, Math.min(255, 128 + tex * 3));
    }
    const png = await (realSharp!(raw, { raw: { width: W, height: W, channels: 3 } }) as unknown as { png(): { toBuffer(): Promise<Buffer> } }).png().toBuffer();

    const thumb = await makeThumbnail(png);
    expect(thumb.length).toBeLessThanOrEqual(THUMB_MAX_BYTES);
    expect(thumb.length).toBeLessThan(png.length);
    const meta = await realSharp!(thumb).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(THUMB_SIZE);
    expect(meta.height).toBe(THUMB_SIZE);
  });
});

// ── lógica de tamanho (codificador falso — roda sempre) ─────────────────────
describe("makeThumbnail — busca a maior qualidade que cabe em 200 KB", () => {
  it("cabe de primeira → devolve a de qualidade 80, sem tentar as outras", async () => {
    const calls: number[] = [];
    setThumbnailEncoderForTesting(async (_in, q) => { calls.push(q); return Buffer.alloc(120_000); });
    const out = await makeThumbnail(FAKE_ORIGINAL);
    expect(out.length).toBe(120_000);
    expect(calls).toEqual([80]);
  });

  it("estoura o alvo em 80 e 70, cabe em 60 → devolve a de 60", async () => {
    const sizeAt: Record<number, number> = { 80: 320_000, 70: 250_000, 60: 190_000, 50: 150_000 };
    const calls: number[] = [];
    setThumbnailEncoderForTesting(async (_in, q) => { calls.push(q); return Buffer.alloc(sizeAt[q]!); });
    const out = await makeThumbnail(FAKE_ORIGINAL);
    expect(out.length).toBe(190_000);
    expect(calls).toEqual([80, 70, 60]);
  });

  it("nenhuma qualidade cabe → devolve a MENOR gerada, com aviso (melhor que nenhuma miniatura)", async () => {
    const sizeAt: Record<number, number> = { 80: 500_000, 70: 420_000, 60: 380_000, 50: 400_000 };
    setThumbnailEncoderForTesting(async (_in, q) => Buffer.alloc(sizeAt[q]!));
    const out = await makeThumbnail(FAKE_ORIGINAL);
    expect(out.length).toBe(380_000);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("acima do alvo"));
  });

  it("as constantes combinam com o pedido: 600×600, alvo 200 KB, começa em q80", () => {
    expect(THUMB_SIZE).toBe(600);
    expect(THUMB_MAX_BYTES).toBe(200_000);
    expect(THUMB_QUALITIES[0]).toBe(80);
  });
});

// ── storage: miniatura ao lado do original ──────────────────────────────────
describe("storage — miniatura ao lado do original", () => {
  const key = "thumb-spec-key";

  it("store() grava o original E a miniatura (<cacheKey>_thumb.jpg); a URL devolvida continua sendo a do original", async () => {
    setThumbnailEncoderForTesting(async () => FAKE_THUMB);
    const url = await store(key, FAKE_ORIGINAL);
    expect(url).toContain(`/${key}.png?v=`);
    expect(url).not.toContain("_thumb");
    expect(publicUrl(key)).toBe(`/assets/generated/${key}.png`);

    const st = await statThumb(key);
    expect(st).not.toBeNull();
    expect(thumbUrl(key, st!.version)).toBe(`/assets/generated/${key}_thumb.jpg?v=${st!.version}`);
    expect(await readFile(join(tmp, `${key}_thumb.jpg`))).toEqual(FAKE_THUMB);
    expect(await readFile(join(tmp, `${key}.png`))).toEqual(FAKE_ORIGINAL);
  });

  it("thumbUrl sem versão não tem '?v=' (mesmo padrão de publicUrl)", () => {
    expect(thumbUrl(key)).toBe(`/assets/generated/${key}_thumb.jpg`);
  });

  it("FALHA na miniatura NUNCA impede o retrato de ser salvo: original gravado, sem lançar, aviso no log", async () => {
    setThumbnailEncoderForTesting(async () => { throw new Error("sharp explodiu"); });
    await expect(store(key, FAKE_ORIGINAL)).resolves.toContain(`/${key}.png?v=`);
    expect(await stat(key)).not.toBeNull(); // o retrato está lá
    expect(await readFile(join(tmp, `${key}.png`))).toEqual(FAKE_ORIGINAL);
    expect(await statThumb(key)).toBeNull(); // e só a miniatura ficou de fora
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("falha ao gerar a miniatura"));
  });

  it("sharp AUSENTE (import falha) também só vira aviso — o retrato é salvo", async () => {
    setThumbnailEncoderForTesting(async () => { throw new Error("sharp não está instalado (pnpm --filter @genbreedai/api add sharp) — miniatura não gerada"); });
    await expect(store(key, FAKE_ORIGINAL)).resolves.toBeTypeOf("string");
    expect(await stat(key)).not.toBeNull();
    expect(await statThumb(key)).toBeNull();
  });

  it("regravar o retrato com a miniatura falhando NÃO deixa a miniatura ANTIGA servindo a imagem errada", async () => {
    setThumbnailEncoderForTesting(async () => FAKE_THUMB);
    await store(key, FAKE_ORIGINAL);
    expect(await statThumb(key)).not.toBeNull();

    setThumbnailEncoderForTesting(async () => { throw new Error("falhou"); });
    await store(key, Buffer.from("png-novo"));
    expect(await stat(key)).not.toBeNull();
    expect(await statThumb(key)).toBeNull(); // removida em vez de ficar velha
  });

  it("remove() apaga o original E a miniatura (regeneração não deixa miniatura velha no ar)", async () => {
    setThumbnailEncoderForTesting(async () => FAKE_THUMB);
    await store(key, FAKE_ORIGINAL);
    await remove(key);
    expect(await stat(key)).toBeNull();
    expect(await statThumb(key)).toBeNull();
  });
});

// ── rota pública: thumbUrl ──────────────────────────────────────────────────
describe("GET /public/specimens/:id — thumbUrl", () => {
  const repo = new InMemorySpecimenRepository();
  const controller = new PublicSpecimenController(repo);
  const id = "onca-pintada";

  async function cacheKeyOfFounder(): Promise<string> {
    const s = await repo.get(id);
    return cacheKeyOf(s!);
  }

  it("sem retrato nenhum: imageUrl e thumbUrl null", async () => {
    const view = await controller.get(id);
    expect(view.imageUrl).toBeNull();
    expect(view.thumbUrl).toBeNull();
  });

  it("retrato COM miniatura: thumbUrl aponta para <cacheKey>_thumb.jpg com '?v='; imageUrl continua sendo o original", async () => {
    const key = await cacheKeyOfFounder();
    setThumbnailEncoderForTesting(async () => FAKE_THUMB);
    await store(key, FAKE_ORIGINAL);
    const view = await controller.get(id);
    expect(view.imageUrl).toContain(`/${key}.png?v=`);
    expect(view.thumbUrl).toContain(`/${key}_thumb.jpg?v=`);
  });

  it("retrato SEM miniatura (anterior à ADR-0027 ou geração falhou): thumbUrl null, imageUrl presente — a web cai na original", async () => {
    const key = await cacheKeyOfFounder();
    setThumbnailEncoderForTesting(async () => { throw new Error("falhou"); });
    await store(key, FAKE_ORIGINAL);
    const view = await controller.get(id);
    expect(view.imageUrl).toContain(`/${key}.png?v=`);
    expect(view.thumbUrl).toBeNull();
  });
});
