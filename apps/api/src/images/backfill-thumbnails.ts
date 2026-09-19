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
 *
 * Fluxo: (1) lista TODOS os objetos do prefixo, paginando até o fim; (2) só
 * então classifica: um `.png` é candidato se o `_thumb.jpg` dele NÃO está na
 * lista; (3) SEMPRE imprime a contagem (existem / já têm / faltam), inclusive
 * quando faltam zero; (4) com `--apply`, gera as que faltam, com progresso.
 */
import { listStoredNames, readOriginal, storeThumbnail, storageMode } from "./storage";
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

/** Bucket "real" pra exibir e comparar com --confirm-bucket: o do R2 quando o storage é R2; senão "local". */
export function currentBucket(): string {
  const mode = storageMode();
  return mode.kind === "r2" ? mode.bucket : "local";
}

const ORIGINAL_SUFFIX = ".png";
const THUMB_SUFFIX = "_thumb.jpg";
/** Uma linha de progresso a cada N processados. */
export const PROGRESS_EVERY = 10;
/** Quantos "faltantes" o dry-run mostra de amostra. */
const DRY_RUN_SAMPLE = 10;

export interface Inventory {
  /** Objetos listados no prefixo (todas as páginas). */
  objetos: number;
  paginas: number;
  /** cacheKeys com original `.png`. */
  retratos: string[];
  /** cacheKeys que já têm `_thumb.jpg`. */
  comMiniatura: number;
  /** Dos retratos, os que NÃO têm miniatura (candidatos). */
  faltam: string[];
  /** `_thumb.jpg` cujo `.png` não está na lista (informativo). */
  miniaturasSemOriginal: number;
  /** Outros objetos no prefixo (nem `.png` nem `_thumb.jpg`). */
  outros: number;
}

/** Classificação pura de nomes de arquivo (sem I/O): decide os candidatos DEPOIS de ver todos os nomes. */
export function classifyNames(names: string[], paginas: number): Inventory {
  const originals = new Set<string>();
  const thumbs = new Set<string>();
  let outros = 0;
  for (const n of names) {
    if (n.endsWith(THUMB_SUFFIX)) thumbs.add(n.slice(0, -THUMB_SUFFIX.length));
    else if (n.endsWith(ORIGINAL_SUFFIX)) originals.add(n.slice(0, -ORIGINAL_SUFFIX.length));
    else outros++;
  }
  const retratos = [...originals].sort();
  const faltam = retratos.filter((k) => !thumbs.has(k));
  let miniaturasSemOriginal = 0;
  for (const k of thumbs) if (!originals.has(k)) miniaturasSemOriginal++;
  return {
    objetos: names.length, paginas, retratos,
    comMiniatura: retratos.length - faltam.length, faltam, miniaturasSemOriginal, outros,
  };
}

/** As linhas da contagem — SEMPRE as mesmas, inclusive com zero faltando. */
export function inventoryLines(inv: Inventory): string[] {
  return [
    `Objetos listados no prefixo: ${inv.objetos} (${inv.paginas} página(s))`,
    `Retratos (.png): ${inv.retratos.length}`,
    `Já têm miniatura: ${inv.comMiniatura}`,
    `Sem miniatura: ${inv.faltam.length}`,
    ...(inv.miniaturasSemOriginal > 0 ? [`(aviso) miniaturas sem o .png correspondente: ${inv.miniaturasSemOriginal}`] : []),
    ...(inv.outros > 0 ? [`(info) outros objetos no prefixo: ${inv.outros}`] : []),
  ];
}

export interface BackfillSummary {
  inventory: Inventory;
  processados: number;
  gerados: number;
  falhas: { cacheKey: string; message: string }[];
}

/** Dependências de I/O — injetáveis nos testes (listagem simulada, sem sharp/R2). */
export interface BackfillDeps {
  list: () => Promise<{ names: string[]; pages: number }>;
  readOriginal: (cacheKey: string) => Promise<Buffer | null>;
  makeThumbnail: (png: Buffer) => Promise<Buffer>;
  storeThumbnail: (cacheKey: string, jpeg: Buffer) => Promise<unknown>;
}
const defaultDeps: BackfillDeps = { list: listStoredNames, readOriginal, makeThumbnail, storeThumbnail };

/**
 * `apply=false` só conta e mostra uma amostra (dry-run). Com `apply`, gera a
 * miniatura dos que faltam (até `max`), sem nunca lançar por causa de um retrato
 * ruim: registra a falha e segue. Uma falha na LISTAGEM lança (o CLI imprime e
 * sai com 1). Imprime via `log`: a contagem sempre, o progresso a cada
 * `PROGRESS_EVERY`, e no fim `GERADAS: n | FALHAS: n` com as falhas listadas.
 */
export async function runBackfill(
  opts: { apply: boolean; max?: number },
  log: (line: string) => void = console.log,
  deps: BackfillDeps = defaultDeps,
): Promise<BackfillSummary> {
  const { names, pages } = await deps.list(); // TODAS as páginas, antes de qualquer decisão
  const inventory = classifyNames(names, pages);
  const summary: BackfillSummary = { inventory, processados: 0, gerados: 0, falhas: [] };

  log("");
  for (const line of inventoryLines(inventory)) log(line);

  if (!opts.apply) {
    if (inventory.faltam.length > 0) {
      log(`\nAmostra dos que faltam (${Math.min(DRY_RUN_SAMPLE, inventory.faltam.length)} de ${inventory.faltam.length}):`);
      for (const k of inventory.faltam.slice(0, DRY_RUN_SAMPLE)) log(`  ${k}`);
    }
    return summary;
  }

  const targets = opts.max !== undefined ? inventory.faltam.slice(0, opts.max) : inventory.faltam;
  log(`\nProcessando ${targets.length} de ${inventory.faltam.length}${opts.max !== undefined ? ` (--max=${opts.max})` : ""}…`);
  for (const key of targets) {
    summary.processados++;
    try {
      const original = await deps.readOriginal(key);
      if (!original) throw new Error("original não encontrado (sumiu entre a listagem e a leitura)");
      await deps.storeThumbnail(key, await deps.makeThumbnail(original));
      summary.gerados++;
    } catch (e) {
      const message = (e as Error).message;
      summary.falhas.push({ cacheKey: key, message });
      log(`  ${key}: FALHA — ${message}`);
    }
    if (summary.processados % PROGRESS_EVERY === 0 || summary.processados === targets.length) {
      log(`  progresso: ${summary.processados}/${targets.length} (geradas ${summary.gerados}, falhas ${summary.falhas.length})`);
    }
  }

  log(`\nGERADAS: ${summary.gerados} | FALHAS: ${summary.falhas.length}`);
  for (const f of summary.falhas) log(`  ${f.cacheKey}: ${f.message}`);
  return summary;
}
