/**
 * `pnpm --filter @genbreedai/api images:backfill-thumbs` — gera as miniaturas
 * (ADR-0027) dos retratos que já existiam antes dela. Lógica em
 * `backfill-thumbnails.ts`; aqui só o `.env` e a linha de comando. Sem a fal.ai,
 * sem imagem nova, sem tocar no original.
 *
 * Seguro por padrão (mesmo padrão das demais operações de administração):
 *  - sem `--apply`: DRY-RUN — lista TODOS os objetos (paginando) e conta quantos
 *    retratos existem / já têm miniatura / faltam; não grava nada;
 *  - `--apply` exige `--confirm-bucket=<bucket real>` (R2_BUCKET, ou "local");
 *  - `--max=N` limita quantos processar nesta rodada (opcional; rode de novo
 *    para continuar — o que já tem miniatura é pulado).
 *
 * NUNCA termina em silêncio: sempre imprime a contagem; falha (inclusive na
 * listagem) imprime o erro e sai com código 1; se o processo encerrar sem chegar
 * ao fim (ex.: promessa que nunca resolve), o handler de `exit` avisa e marca 1.
 */
import "dotenv/config"; // ANTES do storage (ele lê R2_* na importação)
import { parseArgs, currentBucket, runBackfill, type BackfillSummary } from "./backfill-thumbnails";
import { storageMode, r2PartiallyConfigured } from "./storage";

let finished = false;
process.on("exit", () => {
  if (!finished) {
    console.error("[images:backfill-thumbs] ENCERROU SEM CONCLUIR (nenhuma contagem final) — trate como FALHA.");
    process.exitCode = 1;
  }
});

function fail(message: string): never {
  finished = true; // a saída é deliberada, com mensagem
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const { apply, confirmBucket, max, maxRaw } = parseArgs(process.argv.slice(2));

  if (r2PartiallyConfigured()) {
    fail(
      "[images:backfill-thumbs] ABORTADO — configuração PARCIAL do R2: há variáveis R2_* definidas, mas não as cinco " +
        "(R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL). Sem as cinco o storage cai no " +
        "DISCO LOCAL e o script olharia a pasta errada (e não veria nenhum retrato do bucket).",
    );
  }

  const bucket = currentBucket();
  const mode = storageMode();
  console.log(`Bucket: ${bucket}`);
  console.log(`Storage: ${mode.kind === "r2" ? `R2 (${mode.bucket})` : `disco local (${mode.dir})`}`);
  console.log(`MODO: ${apply ? "APPLY" : "DRY-RUN"}`);

  if (max !== undefined && (!Number.isInteger(max) || max <= 0)) {
    fail(`[images:backfill-thumbs] ABORTADO — --max deve ser um inteiro positivo (recebido: "${maxRaw}").`);
  }
  if (apply && confirmBucket !== bucket) {
    fail(
      "[images:backfill-thumbs] ABORTADO — trava de gravação: --apply exige --confirm-bucket=<bucket> IGUAL ao bucket real.\n" +
        `Bucket real: ${bucket}\n` +
        (confirmBucket ? `--confirm-bucket recebido: ${confirmBucket} (não bate)\n` : "--confirm-bucket não informado.\n") +
        `Rode de novo com: --apply --confirm-bucket=${bucket}`,
    );
  }

  let summary: BackfillSummary;
  try {
    summary = await runBackfill({ apply, max });
  } catch (e) {
    fail(`[images:backfill-thumbs] ERRO — a listagem/execução falhou: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!apply) console.log("\nDry-run — nada foi gravado. Rode com --apply --confirm-bucket=<bucket> [--max=N] para gerar as miniaturas.");
  if (summary.falhas.length > 0) process.exitCode = 1;
  finished = true;
  console.log("Terminado.");
}

main().catch((e) => {
  fail(`[images:backfill-thumbs] ERRO inesperado: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
});
