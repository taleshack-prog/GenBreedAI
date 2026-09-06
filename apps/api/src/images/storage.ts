/**
 * Storage local: grava o PNG em apps/web/public/assets/generated/{cacheKey}.png,
 * servido estaticamente pelo web. Produção: Cloudflare R2/S3 + CDN (TDD §2/§5).
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const DIR = join(process.cwd(), "..", "web", "public", "assets", "generated");
export function publicUrl(cacheKey: string): string { return `/assets/generated/${cacheKey}.png`; }

export async function exists(cacheKey: string): Promise<boolean> {
  try { await access(join(DIR, `${cacheKey}.png`)); return true; } catch { return false; }
}
export async function store(cacheKey: string, buffer: Buffer): Promise<string> {
  await mkdir(DIR, { recursive: true });
  await writeFile(join(DIR, `${cacheKey}.png`), buffer);
  return publicUrl(cacheKey);
}
