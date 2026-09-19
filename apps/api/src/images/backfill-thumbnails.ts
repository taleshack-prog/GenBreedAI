/**
 * Núcleo do backfill de miniaturas (ADR-0027) — sem `dotenv`, sem `process.exit`,
 * sem `main()`: importável nos testes sem carregar o `.env` local (que tem R2
 * de verdade). O script executável é `backfill-thumbnails-cli.ts`
 * (`pnpm --filter @genbreedai/api images:backfill-thumbs`).
 *
 * Os retratos gerados ANTES da ADR-0027 não têm `<cacheKey>_thumb.jpg`, então o
 * link deles no WhatsApp continua sem prévia. O backfill só LÊ o PNG original do
 * storage (R2 ou disco), redimensiona (600×600 JPEG, o mesmo `makeThumbnail` do
 * dia a dia) e grava a miniatura ao lado. NUNCA chama a fal.ai, NUNCA gera
 * imagem nova e NUNCA escreve no original nem apaga nada — só cria objetos
 * `_thumb.jpg` que ainda não existem (idempotente: rodar de novo pula o que já
 * tem miniatura). Requer `sharp` instalado.
 */
import { listCacheKeys, readOriginal, statThumb, storeThumbnail } from "./storage";
import { makeThumbnail } from "./thumbnail";

export interface ParsedArgs {
  apply: boolean;
  confirmBucket: string | undefined;
  max: number | undefined;
  maxRaw: string | undefined;
}

/** Parsing puro — sem I/O, sem process.exit. */
export function parseArgs(argv: string[]): ParsedArgs {
  const apply = argv.includes("--apply");
  const confirmBucket = argv.find((a) => a.startsWith("--confirm-bucket="))?.slice("--confirm-bucket=".length);
  const maxRaw = argv.find((a) => a.startsWith("--max="))?.slice("--max=".length);
  const max = maxRaw !== undefined ? Number(maxRaw) : undefined;
  return { apply, confirmBucket, max, maxRaw };
}

/** Bucket "real" pra exibir e comparar com --confirm-bucket. */
export function currentBucket(): string {
  return process.env.R2_BUCKET || "local";
}

export interface BackfillSummary {
  total: number;          // retratos com original no storage
  semMiniatura: number;   // dos quais, ainda sem miniatura
  processados: number;    // tentados nesta rodada (só com apply)
  gerados: number;
  falhas: { cacheKey: string; message: string }[];
}

/**
 * `apply=false` só conta (dry-run). Com `apply`, gera a miniatura dos que faltam
 * (até `max`), sem nunca lançar por causa de um retrato ruim: registra a falha e
 * segue pro próximo.
 */
export async function runBackfill(opts: { apply: boolean; max?: number }, log: (line: string) => void = console.log): Promise<BackfillSummary> {
  const keys = await listCacheKeys();
  const missing: string[] = [];
  for (const key of keys) if ((await statThumb(key)) === null) missing.push(key);

  const summary: BackfillSummary = { total: keys.length, semMiniatura: missing.length, processados: 0, gerados: 0, falhas: [] };
  if (!opts.apply) return summary;

  const targets = opts.max !== undefined ? missing.slice(0, opts.max) : missing;
  for (const key of targets) {
    summary.processados++;
    try {
      const original = await readOriginal(key);
      if (!original) throw new Error("original não encontrado (sumiu entre a listagem e a leitura)");
      await storeThumbnail(key, await makeThumbnail(original));
      summary.gerados++;
      log(`  ${key}: OK`);
    } catch (e) {
      const message = (e as Error).message;
      summary.falhas.push({ cacheKey: key, message });
      log(`  ${key}: FALHA — ${message}`);
    }
  }
  return summary;
}
