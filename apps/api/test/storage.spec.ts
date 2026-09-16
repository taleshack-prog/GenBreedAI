/**
 * Cache-busting por versão (?v=) — mesma cacheKey/endereço de arquivo, só a
 * query muda a cada gravação, pra navegador/CDN pararem de servir uma
 * imagem regenerada anterior (achado real: leao-femea regenerada, R2 com a
 * imagem nova, jogo mostrando a velha — mesmo endereço, sem cache-busting).
 * Roda em modo disco local (sem R2_*, ambiente de teste) — grava de verdade
 * em apps/web/public/assets/generated/ e limpa depois (afterEach).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicUrl, store, stat, remove } from "../src/images/storage";

// Pasta temporária própria (IMAGE_STORAGE_DIR) — nunca
// apps/web/public/assets/generated, que tem arquivos reais.
const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
let imgTmpDir: string;
let savedEnv: Record<string, string | undefined>;

describe("storage.ts — versão do objeto (?v=)", () => {
  const cacheKey = "test-storage-spec-cache-busting";
  beforeEach(async () => {
    imgTmpDir = await mkdtemp(join(tmpdir(), "genbreedai-images-"));
    savedEnv = { IMAGE_STORAGE_DIR: process.env.IMAGE_STORAGE_DIR };
    for (const k of R2_VARS) savedEnv[k] = process.env[k];
    process.env.IMAGE_STORAGE_DIR = imgTmpDir;
    for (const k of R2_VARS) delete process.env[k];
  });
  afterEach(async () => {
    await remove(cacheKey);
    for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await rm(imgTmpDir, { recursive: true, force: true });
  });

  it("publicUrl com versão contém '?v='", () => {
    const url = publicUrl(cacheKey, 1700000000);
    expect(url).toContain("?v=1700000000");
  });

  it("publicUrl sem versão não contém '?v=' (retrocompatível)", () => {
    const url = publicUrl(cacheKey);
    expect(url).not.toContain("?v=");
  });

  it("stat() reflete a versão do que store() acabou de gravar", async () => {
    const url = await store(cacheKey, Buffer.from("v1"));
    const st = await stat(cacheKey);
    expect(st).not.toBeNull();
    expect(url).toContain(`?v=${st!.version}`);
  });

  it("stat() de cacheKey inexistente é null", async () => {
    expect(await stat("test-storage-spec-nao-existe")).toBeNull();
  });

  it("após store com force (regravar o MESMO cacheKey), a URL retornada difere da anterior — mesmo endereço, versão nova", async () => {
    const url1 = await store(cacheKey, Buffer.from("versao-original"));
    // Versão = epoch em SEGUNDOS (mesma granularidade do LastModified do R2,
    // ver storage.ts) — espera passar pro menos 1s pra garantir uma versão
    // diferente na regravação (não é flakiness: é a precisão real do R2).
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const url2 = await store(cacheKey, Buffer.from("versao-regenerada-force"));
    expect(url1).not.toBe(url2);
    // Mesmo endereço/arquivo (a chave nunca muda) — só a query de versão.
    expect(url1.split("?")[0]).toBe(url2.split("?")[0]);
  }, 5000);
});
