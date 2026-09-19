/**
 * `pnpm --filter @genbreedai/api images:backfill-thumbs` — gera as miniaturas
 * (ADR-0027) dos retratos que já existiam antes dela. Lógica em
 * `backfill-thumbnails.ts`; aqui só o `.env` e a linha de comando. Sem a fal.ai,
 * sem imagem nova, sem tocar no original.
 *
 * Seguro por padrão (mesmo padrão das demais operações de administração):
 *  - sem `--apply`: DRY-RUN — só conta quantos retratos estão sem miniatura
 *    (é assim que se descobre o número); não grava nada;
 *  - `--apply` exige `--confirm-bucket=<bucket real>` (R2_BUCKET, ou "local");
 *  - `--max=N` limita quantos processar nesta rodada (opcional; rode de novo
 *    para continuar — o que já tem miniatura é pulado).
 */
import "dotenv/config"; // ANTES do storage (ele lê R2_* na importação)
import { parseArgs, currentBucket, runBackfill } from "./backfill-thumbnails";

async function main(): Promise<void> {
  const { apply, confirmBucket, max, maxRaw } = parseArgs(process.argv.slice(2));
  const bucket = currentBucket();
  console.log(`Bucket: ${bucket}`);
  console.log(`MODO: ${apply ? "APPLY" : "DRY-RUN"}`);

  if (max !== undefined && (!Number.isInteger(max) || max <= 0)) {
    console.error(`[images:backfill-thumbs] ABORTADO — --max deve ser um inteiro positivo (recebido: "${maxRaw}").`);
    process.exit(1);
  }
  if (apply && confirmBucket !== bucket) {
    console.error(
      "[images:backfill-thumbs] ABORTADO — trava de gravação: --apply exige --confirm-bucket=<bucket> IGUAL ao bucket real.\n" +
        `Bucket real: ${bucket}\n` +
        (confirmBucket ? `--confirm-bucket recebido: ${confirmBucket} (não bate)\n` : "--confirm-bucket não informado.\n") +
        `Rode de novo com: --apply --confirm-bucket=${bucket}`,
    );
    process.exit(1);
  }

  const s = await runBackfill({ apply, max });
  console.log(`\nRetratos com original no storage: ${s.total}`);
  console.log(`Sem miniatura: ${s.semMiniatura}`);
  if (!apply) {
    console.log("Dry-run — nada foi gravado. Rode com --apply --confirm-bucket=<bucket> [--max=N] para gerar as miniaturas.");
    return;
  }
  console.log(`Processados: ${s.processados} · gerados: ${s.gerados} · falhas: ${s.falhas.length}`);
  if (s.falhas.length > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
