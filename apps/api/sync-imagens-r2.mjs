import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
const DIR = join(process.cwd(), "..", "web", "public", "assets", "generated");
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) { console.error("Faltam R2_* no .env"); process.exit(1); }
const s3 = new S3Client({ region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
const files = (await readdir(DIR)).filter((f) => f.endsWith(".png"));
console.log(`Enviando ${files.length} imagens ao R2...`);
let ok = 0;
for (const f of files) { const body = await readFile(join(DIR, f)); await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: `generated/${f}`, Body: body, ContentType: "image/png" })); ok++; if (ok % 25 === 0) console.log(`  ${ok}/${files.length}`); }
console.log(`Concluído: ${ok} imagens no R2.`);
