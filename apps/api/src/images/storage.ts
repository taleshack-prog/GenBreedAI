/**
 * Storage de imagens. Produção: Cloudflare R2 (S3-compatível) quando as env R2_*
 * estão definidas — imagens persistem em bucket + CDN (essencial em serverless).
 * Dev/local: grava em apps/web/public/assets/generated/{cacheKey}.png.
 *
 * A troca é automática por ambiente: sem R2_* → disco; com R2_* → bucket.
 */
import { mkdir, writeFile, access, rm } from "node:fs/promises";
import { join } from "node:path";
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const DIR = join(process.cwd(), "..", "web", "public", "assets", "generated");

// ── R2 (opcional) ──
const R2 = {
  account: process.env.R2_ACCOUNT_ID,
  key: process.env.R2_ACCESS_KEY_ID,
  secret: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
  publicUrl: process.env.R2_PUBLIC_URL, // ex.: https://img.genbreed.com.br ou o domínio r2.dev do bucket
};
const useR2 = Boolean(R2.account && R2.key && R2.secret && R2.bucket && R2.publicUrl);
let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2.account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2.key!, secretAccessKey: R2.secret! },
  });
  return s3;
}
const objKey = (cacheKey: string) => `generated/${cacheKey}.png`;

export function publicUrl(cacheKey: string): string {
  if (useR2) return `${R2.publicUrl!.replace(/\/$/, "")}/${objKey(cacheKey)}`;
  return `/assets/generated/${cacheKey}.png`;
}

export async function exists(cacheKey: string): Promise<boolean> {
  if (useR2) {
    try { await client().send(new HeadObjectCommand({ Bucket: R2.bucket!, Key: objKey(cacheKey) })); return true; }
    catch { return false; }
  }
  try { await access(join(DIR, `${cacheKey}.png`)); return true; } catch { return false; }
}

export async function store(cacheKey: string, buffer: Buffer): Promise<string> {
  if (useR2) {
    await client().send(new PutObjectCommand({ Bucket: R2.bucket!, Key: objKey(cacheKey), Body: buffer, ContentType: "image/png" }));
    return publicUrl(cacheKey);
  }
  await mkdir(DIR, { recursive: true });
  await writeFile(join(DIR, `${cacheKey}.png`), buffer);
  return publicUrl(cacheKey);
}

export async function remove(cacheKey: string): Promise<void> {
  if (useR2) {
    try { await client().send(new DeleteObjectCommand({ Bucket: R2.bucket!, Key: objKey(cacheKey) })); } catch { /* já não existe */ }
    return;
  }
  try { await rm(join(DIR, `${cacheKey}.png`)); } catch { /* já não existe */ }
}
