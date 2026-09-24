/**
 * Storage de imagens. Produção: Cloudflare R2 (S3-compatível) quando as env R2_*
 * estão definidas — imagens persistem em bucket + CDN (essencial em serverless).
 * Dev/local: grava em apps/web/public/assets/generated/{cacheKey}.png.
 *
 * A troca é automática por ambiente: sem R2_* → disco; com R2_* → bucket.
 */
import { mkdir, writeFile, readFile, readdir, stat as fsStat, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { makeThumbnail } from "./thumbnail";

/**
 * Pasta local (sem R2) — padrão apps/web/public/assets/generated (dev sem R2:
 * grava ali, o Next serve como estático). `IMAGE_STORAGE_DIR`, quando
 * definida, sobrepõe o padrão — usado pelos testes (cada um aponta pra uma
 * pasta temporária própria, `fs.mkdtemp`, pra nunca tocar a pasta real, que
 * tem arquivos de verdade). Lida a CADA chamada (função, não uma constante
 * fixada no import) — sem isso, um teste que troca a env em `beforeEach`
 * não teria efeito, porque o módulo só é importado uma vez por processo.
 */
function dir(): string {
  return process.env.IMAGE_STORAGE_DIR || join(process.cwd(), "..", "web", "public", "assets", "generated");
}

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
/** Miniatura (ADR-0027): sufixo PREVISÍVEL ao lado do original — `generated/<cacheKey>_thumb.jpg`. */
const THUMB_SUFFIX = "_thumb.jpg";
const thumbObjKey = (cacheKey: string) => `generated/${cacheKey}${THUMB_SUFFIX}`;

/**
 * URL pública do objeto. `version` (epoch em SEGUNDOS — HeadObject.LastModified
 * no R2, mtime em disco local) vira `?v=<version>` — cache-busting sem mudar
 * o endereço do arquivo (a chave/nome continua só `cacheKey`). Sem `version`,
 * URL igual a antes (retrocompatível — ex.: link antigo já salvo em algum lugar).
 */
export function publicUrl(cacheKey: string, version?: number): string {
  const suffix = version !== undefined ? `?v=${version}` : "";
  if (useR2) return `${R2.publicUrl!.replace(/\/$/, "")}/${objKey(cacheKey)}${suffix}`;
  return `/assets/generated/${cacheKey}.png${suffix}`;
}

/**
 * URL pública da MINIATURA (600×600 JPEG, ADR-0027) — mesmo padrão de
 * `publicUrl` (`?v=<version>` quando há versão). Só chame com a versão de
 * `statThumb()`: a miniatura pode não existir (retratos anteriores à ADR-0027).
 */
export function thumbUrl(cacheKey: string, version?: number): string {
  const suffix = version !== undefined ? `?v=${version}` : "";
  if (useR2) return `${R2.publicUrl!.replace(/\/$/, "")}/${thumbObjKey(cacheKey)}${suffix}`;
  return `/assets/generated/${cacheKey}${THUMB_SUFFIX}${suffix}`;
}

async function statObject(r2Key: string, diskName: string): Promise<{ version: number } | null> {
  if (useR2) {
    try {
      const res = await client().send(new HeadObjectCommand({ Bucket: R2.bucket!, Key: r2Key }));
      return { version: Math.floor((res.LastModified?.getTime() ?? Date.now()) / 1000) };
    } catch { return null; }
  }
  try {
    const s = await fsStat(join(dir(), diskName));
    return { version: Math.floor(s.mtimeMs / 1000) };
  } catch { return null; }
}

/**
 * Versão do objeto gravado (pra cache-busting, ver `publicUrl`) — `null` se
 * o objeto não existe. R2: `HeadObjectCommand.LastModified` (Date) truncado
 * pra segundos. Disco local: `mtime` do arquivo, idem.
 */
export async function stat(cacheKey: string): Promise<{ version: number } | null> {
  return statObject(objKey(cacheKey), `${cacheKey}.png`);
}

/** Igual a `stat()`, mas da miniatura — `null` quando ela não existe (retrato anterior à ADR-0027, ou a geração falhou). */
export async function statThumb(cacheKey: string): Promise<{ version: number } | null> {
  return statObject(thumbObjKey(cacheKey), `${cacheKey}${THUMB_SUFFIX}`);
}

/**
 * URL da miniatura (com `?v=`) SE ela existir, senão `null` — o que as LISTAS da web usam no lugar do PNG original (ADR-0037). Nunca lança:
 * `statThumb` já devolve `null` em qualquer falha, e `null` significa "use o original".
 */
export async function thumbUrlIfExists(cacheKey: string): Promise<string | null> {
  const st = await statThumb(cacheKey);
  return st ? thumbUrl(cacheKey, st.version) : null;
}

/** Wrapper booleano de `stat()` — mantido pelos chamadores que só precisam saber se existe. */
export async function exists(cacheKey: string): Promise<boolean> {
  return (await stat(cacheKey)) !== null;
}

export async function store(cacheKey: string, buffer: Buffer): Promise<string> {
  // Versão = data da GRAVAÇÃO (não um HEAD/stat extra depois de escrever) —
  // determinística, monotônica a cada `store()`, evita um round-trip a mais.
  const version = Math.floor(Date.now() / 1000);
  if (useR2) {
    await client().send(new PutObjectCommand({ Bucket: R2.bucket!, Key: objKey(cacheKey), Body: buffer, ContentType: "image/png" }));
  } else {
    await mkdir(dir(), { recursive: true });
    await writeFile(join(dir(), `${cacheKey}.png`), buffer);
  }
  // O ORIGINAL já está salvo. A miniatura (ADR-0027) é melhor-esforço: qualquer falha
  // (sharp ausente, imagem ilegível, R2 recusando o 2º objeto) vira log e o retrato
  // segue normalmente — nunca impede nem desfaz a gravação do original.
  await storeThumbnailBestEffort(cacheKey, buffer);
  return publicUrl(cacheKey, version);
}

/** Gera e grava a miniatura ao lado do original; nunca lança. */
async function storeThumbnailBestEffort(cacheKey: string, original: Buffer): Promise<void> {
  try {
    await storeThumbnail(cacheKey, await makeThumbnail(original));
  } catch (e) {
    console.warn(`[thumbnail] falha ao gerar a miniatura de ${cacheKey} (o retrato original foi salvo): ${(e as Error).message}`);
    // Não deixa uma miniatura ANTIGA (de um retrato regravado sob o mesmo cacheKey) servindo a imagem errada.
    await removeThumbnail(cacheKey);
  }
}

/** Grava a miniatura JPEG (já pronta) — usada por `store()` e pelo script de backfill. Lança em erro de I/O. */
export async function storeThumbnail(cacheKey: string, jpeg: Buffer): Promise<string> {
  const version = Math.floor(Date.now() / 1000);
  if (useR2) {
    await client().send(new PutObjectCommand({ Bucket: R2.bucket!, Key: thumbObjKey(cacheKey), Body: jpeg, ContentType: "image/jpeg" }));
  } else {
    await mkdir(dir(), { recursive: true });
    await writeFile(join(dir(), `${cacheKey}${THUMB_SUFFIX}`), jpeg);
  }
  return thumbUrl(cacheKey, version);
}

async function removeThumbnail(cacheKey: string): Promise<void> {
  if (useR2) {
    try { await client().send(new DeleteObjectCommand({ Bucket: R2.bucket!, Key: thumbObjKey(cacheKey) })); } catch { /* já não existe */ }
    return;
  }
  try { await rm(join(dir(), `${cacheKey}${THUMB_SUFFIX}`)); } catch { /* já não existe */ }
}

/** Apaga o retrato E a miniatura (senão uma regeneração deixaria a miniatura velha no ar). */
export async function remove(cacheKey: string): Promise<void> {
  await removeThumbnail(cacheKey);
  if (useR2) {
    try { await client().send(new DeleteObjectCommand({ Bucket: R2.bucket!, Key: objKey(cacheKey) })); } catch { /* já não existe */ }
    return;
  }
  try { await rm(join(dir(), `${cacheKey}.png`)); } catch { /* já não existe */ }
}

/** De onde o storage está lendo/gravando de fato (R2 só com as CINCO `R2_*`; senão, disco local). */
export function storageMode(): { kind: "r2"; bucket: string } | { kind: "local"; dir: string } {
  return useR2 ? { kind: "r2", bucket: R2.bucket! } : { kind: "local", dir: dir() };
}

/**
 * `true` quando ALGUMA `R2_*` está definida mas não as cinco — o storage cai no
 * disco local em silêncio (pendência do CLAUDE.md §6). Scripts de administração
 * usam isto pra abortar em vez de operar na pasta errada.
 */
export function r2PartiallyConfigured(): boolean {
  const set = [R2.account, R2.key, R2.secret, R2.bucket, R2.publicUrl].filter(Boolean).length;
  return set > 0 && !useR2;
}

/** Uma página de listagem: as chaves e o token da PRÓXIMA página (`undefined` = era a última). */
export interface ListPage { keys: string[]; nextToken?: string }

/**
 * Percorre TODAS as páginas de uma listagem paginada por token (ListObjectsV2 devolve no
 * máximo 1000 objetos por chamada) e junta as chaves antes de qualquer decisão. Nunca
 * termina em silêncio com um subconjunto: token repetido (laço) ou teto de páginas
 * estourado LANÇAM. Pura em relação ao S3 — `fetchPage` é injetado (testável sem rede).
 */
export async function collectAllPages(
  fetchPage: (token: string | undefined) => Promise<ListPage>,
  maxPages = 100_000,
): Promise<{ keys: string[]; pages: number }> {
  const keys: string[] = [];
  const seen = new Set<string>();
  let token: string | undefined;
  let pages = 0;
  do {
    const page = await fetchPage(token);
    pages++;
    for (const k of page.keys) keys.push(k);
    token = page.nextToken;
    if (token !== undefined) {
      if (seen.has(token)) throw new Error(`paginação em laço: ContinuationToken repetido na página ${pages}`);
      seen.add(token);
      if (pages >= maxPages) throw new Error(`listagem passou de ${maxPages} páginas — abortada por segurança`);
    }
  } while (token !== undefined);
  return { keys, pages };
}

/**
 * Inventário do storage pro backfill (`images:backfill-thumbs`): TODOS os nomes de arquivo
 * do prefixo `generated/` (originais `.png` E miniaturas `_thumb.jpg`, sem o prefixo),
 * paginando até o fim. R2: ListObjectsV2 paginado; disco: a pasta. Erros LANÇAM
 * (nada de devolver lista vazia por engano) — exceto pasta local ainda inexistente = vazia.
 */
export async function listStoredNames(): Promise<{ names: string[]; pages: number }> {
  if (useR2) {
    const prefix = "generated/";
    const { keys, pages } = await collectAllPages(async (token) => {
      const res = await client().send(new ListObjectsV2Command({ Bucket: R2.bucket!, Prefix: prefix, ContinuationToken: token }));
      if (res.IsTruncated && !res.NextContinuationToken) {
        throw new Error("R2 indicou listagem truncada sem NextContinuationToken — listagem incompleta, abortada");
      }
      const keys = (res.Contents ?? []).map((o) => o.Key ?? "").filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
      return { keys, nextToken: res.IsTruncated ? res.NextContinuationToken : undefined };
    });
    return { names: keys, pages };
  }
  try {
    return { names: await readdir(dir()), pages: 1 };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { names: [], pages: 1 }; // pasta ainda não existe
    throw e;
  }
}

/** Bytes do retrato original (só leitura) — `null` se não existe. Nunca gera imagem. */
export async function readOriginal(cacheKey: string): Promise<Buffer | null> {
  if (useR2) {
    try {
      const res = await client().send(new GetObjectCommand({ Bucket: R2.bucket!, Key: objKey(cacheKey) }));
      return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
    } catch { return null; }
  }
  try { return await readFile(join(dir(), `${cacheKey}.png`)); } catch { return null; }
}
