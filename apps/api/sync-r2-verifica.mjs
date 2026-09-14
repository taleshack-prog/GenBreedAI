import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
const DIR = join(process.cwd(), "..", "web", "public", "assets", "generated");
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
console.log("Conta:", R2_ACCOUNT_ID, "| Bucket:", R2_BUCKET, "| KeyID:", (R2_ACCESS_KEY_ID||"").slice(0,6)+"...");
const s3 = new S3Client({ region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
const files = (await readdir(DIR)).filter((f) => f.endsWith(".png"));
console.log(`Enviando ${files.length}...`);
let ok = 0, erros = 0;
for (const f of files) {
  try { await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: `generated/${f}`, Body: await readFile(join(DIR, f)), ContentType: "image/png" })); ok++; }
  catch (e) { erros++; if (erros <= 3) console.error("ERRO:", e.name, "-", e.message); }
  if ((ok+erros) % 50 === 0) console.log(`  ${ok+erros}/${files.length}`);
}
console.log(`OK: ${ok} | erros: ${erros}`);
const l = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: "generated/", MaxKeys: 3 }));
console.log("KeyCount no bucket:", l.KeyCount, "| exemplo:", (l.Contents??[])[0]?.Key);
