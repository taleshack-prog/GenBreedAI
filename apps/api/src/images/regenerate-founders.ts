/**
 * ADMIN: regenera retratos de FUNDADORES. Desde 16/09 o site bloqueia isso
 * pra qualquer usuário (`ImageService.generate`: `force` em fundador → 403
 * "Retratos de fundador não podem ser regenerados."); antes deste script só
 * dava pra fazer com comando improvisado. Não toca o banco (Postgres) nem
 * cota — mesmo escopo de seed-portraits.ts: opera só no catálogo em memória
 * (`founderSeeds()`) e no storage de imagem (R2 ou disco local).
 *
 * Uso:
 *   pnpm --filter @genbreedai/api images:regenerate-founders --ids=leao,onca-pintada
 *   pnpm --filter @genbreedai/api images:regenerate-founders --missing
 *   pnpm --filter @genbreedai/api images:regenerate-founders --ids=leao --apply --confirm-bucket=<bucket>
 *   pnpm --filter @genbreedai/api images:regenerate-founders --missing --apply --confirm-bucket=local --max=5
 *
 * Modo padrão = DRY-RUN (não gera, não apaga, só imprime). `--apply` grava.
 *
 * Flags:
 *   --ids=id1,id2        fundadores específicos — TODOS precisam existir em
 *                        founderSeeds() (id desconhecido aborta tudo, antes
 *                        de qualquer ação, mesmo em dry-run).
 *   --missing            todos os fundadores sem retrato ainda (checado via
 *                        `stat()` no storage de verdade).
 *   --apply              grava. Sem ela, dry-run (default).
 *   --confirm-bucket=X   OBRIGATÓRIO com --apply; X tem que ser IGUAL ao
 *                        bucket real (`R2_BUCKET`, ou "local" sem R2) — trava
 *                        de gravação, mesmo espírito do --confirm-host do
 *                        db:backfill-sex.
 *   --max=N              OBRIGATÓRIO quando a execução envolveria mais de 10
 *                        retratos; corta a lista pros N primeiros.
 * Exatamente um entre --ids e --missing (nem os dois, nem nenhum).
 *
 * Regras de gravação:
 *   --ids   (apply): APAGA e regenera cada um (`regenerateFounderAdmin`) —
 *           retrato NOVO mesmo se já existisse. Sem cota (skipQuota=true).
 *   --missing (apply): só GERA os que ainda não existem (`generateForSpecimen`,
 *           o mesmo caminho de "1ª geração" — NUNCA chama remove()). Sem cota.
 *
 * `regenerateFounderAdmin` (ImageService) é PÚBLICO e só aceita
 * `method === "FOUNDER"` — nenhuma rota HTTP o chama; é a alternativa de
 * administração ao `regenerateOwned` privado (reservado pra dono de espécime
 * real via `generate()`). Prompt/cacheKey/provider vêm de ImageService/
 * storage.ts — nada é reimplementado aqui.
 */
import "dotenv/config";
import { founderSeeds, InMemorySpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import { ImageJobRepository } from "./image-job.repository";
import { ImageService, cacheKeyOf } from "./image.service";
import { ImageQuotaService } from "../economy/image-quota.service";
import { WalletService } from "../economy/wallet.service";
import { InMemoryWalletRepository } from "../economy/wallet.repository";
import { buildPrompt } from "./prompt";
import { stat } from "./storage";

/** Só decide o modelo fal (modelForTier) — sem efeito de cota, skipQuota é sempre true aqui. */
const TIER = "PHD" as const;

export interface ParsedArgs {
  apply: boolean;
  missing: boolean;
  ids: string[] | null;
  confirmBucket: string | undefined;
  max: number | undefined;
  maxRaw: string | undefined;
}

/** Parsing puro — sem I/O, sem process.exit. Testável isolado. */
export function parseArgs(argv: string[]): ParsedArgs {
  const apply = argv.includes("--apply");
  const missing = argv.includes("--missing");
  const idsArg = argv.find((a) => a.startsWith("--ids="))?.slice("--ids=".length);
  const ids = idsArg !== undefined ? idsArg.split(",").map((s) => s.trim()).filter(Boolean) : null;
  const confirmBucket = argv.find((a) => a.startsWith("--confirm-bucket="))?.slice("--confirm-bucket=".length);
  const maxRaw = argv.find((a) => a.startsWith("--max="))?.slice("--max=".length);
  const max = maxRaw !== undefined ? Number(maxRaw) : undefined;
  return { apply, missing, ids, confirmBucket, max, maxRaw };
}

/** Bucket "real" pra exibir e comparar com --confirm-bucket. */
export function currentBucket(): string {
  return process.env.R2_BUCKET || "local";
}

export type TargetsResult = { ok: true; targets: StoredSpecimen[] } | { ok: false; error: string };

/**
 * Resolve a lista de fundadores-alvo — sem I/O de escrita, sem process.exit.
 * `--ids`: valida que TODOS existem em founderSeeds() (senão aborta, listando
 * os desconhecidos). `--missing`: varre `stat()` no storage de verdade.
 */
export async function resolveTargets(
  opts: { ids: string[] | null; missing: boolean },
  all: StoredSpecimen[],
): Promise<TargetsResult> {
  const hasIds = opts.ids !== null;
  if (hasIds === opts.missing) {
    return { ok: false, error: "informe exatamente um entre --ids=<id1,id2,...> e --missing." };
  }
  const byId = new Map(all.map((f) => [f.id, f]));
  if (hasIds) {
    const unknown = opts.ids!.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      return { ok: false, error: `id(s) desconhecido(s), fora de founderSeeds(): ${unknown.join(", ")}` };
    }
    return { ok: true, targets: opts.ids!.map((id) => byId.get(id)!) };
  }
  const withoutPortrait: StoredSpecimen[] = [];
  for (const f of all) {
    const st = await stat(cacheKeyOf(f));
    if (!st) withoutPortrait.push(f);
  }
  return { ok: true, targets: withoutPortrait };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { apply, missing, ids, confirmBucket, max, maxRaw } = parseArgs(argv);
  const bucket = currentBucket();
  // eslint-disable-next-line no-console
  console.log(`BUCKET: ${bucket}`);
  // eslint-disable-next-line no-console
  console.log(`MODO: ${apply ? "APPLY" : "DRY-RUN"}`);

  const all = founderSeeds();
  const resolved = await resolveTargets({ ids, missing }, all);
  if (!resolved.ok) {
    console.error(`[images:regenerate-founders] ABORTADO — ${resolved.error}`);
    process.exit(1);
  }
  let targets = resolved.targets;

  // --max obrigatório acima de 10 retratos na mira; quando informado, também corta a lista.
  if (targets.length > 10 && max === undefined) {
    console.error(
      `[images:regenerate-founders] ABORTADO — ${targets.length} retratos na mira (>10); informe --max=N pra confirmar quantos processar.`,
    );
    process.exit(1);
  }
  if (max !== undefined) {
    if (!Number.isInteger(max) || max <= 0) {
      console.error(`[images:regenerate-founders] ABORTADO — --max deve ser um inteiro positivo (recebido: "${maxRaw}").`);
      process.exit(1);
    }
    targets = targets.slice(0, max);
  }

  // Trava de gravação — só quando --apply (dry-run nunca precisa confirmar bucket).
  if (apply && confirmBucket !== bucket) {
    console.error(
      "[images:regenerate-founders] ABORTADO — trava de gravação: --apply exige --confirm-bucket=<bucket> IGUAL ao bucket real.\n" +
        `Bucket real: ${bucket}\n` +
        (confirmBucket ? `--confirm-bucket recebido: ${confirmBucket} (não bate)\n` : "--confirm-bucket não informado.\n") +
        `Rode de novo com: --apply --confirm-bucket=${bucket}`,
    );
    process.exit(1);
  }

  if (targets.length === 0) {
    console.log(ids !== null ? "Nenhum id informado." : "Nenhum fundador sem retrato — nada a fazer.");
    return;
  }

  if (!apply) {
    console.log(`\nDRY-RUN — ${targets.length} fundador(es), nada será gerado nem apagado:\n`);
    for (const f of targets) {
      const key = cacheKeyOf(f);
      const st = await stat(key);
      const prompt = buildPrompt(f).slice(0, 160);
      console.log(`  ${f.id}\n    cacheKey: ${key}\n    retrato existente: ${st ? "sim" : "não"}\n    prompt (160c): ${prompt}\n`);
    }
    console.log("Dry-run — nada foi gravado. Rode com --apply (+ --confirm-bucket) para gravar.");
    return;
  }

  const repo = new InMemorySpecimenRepository();
  const svc = new ImageService(repo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
  let gerados = 0;
  const falhas: { id: string; message: string }[] = [];
  for (const f of targets) {
    try {
      // --ids: apaga e regenera (admin, fundador). --missing: só gera se faltar, nunca apaga.
      const r = ids !== null
        ? await svc.regenerateFounderAdmin(f, TIER)
        : await svc.generateForSpecimen(f, f.ownerId, TIER, true);
      console.log(`  ${f.id}: ${r.imageUrl ? "OK " + r.imageUrl : r.status}`);
      gerados++;
    } catch (e) {
      const message = (e as Error).message;
      falhas.push({ id: f.id, message });
      console.error(`  ${f.id}: FALHA — ${message}`);
    }
  }

  console.log(`\nGERADOS: ${gerados}`);
  console.log(`FALHAS: ${falhas.length}`);
  for (const f of falhas) console.log(`  ${f.id}: ${f.message}`);
}

// Só roda main() quando o arquivo é executado diretamente (pnpm
// images:regenerate-founders) — importar este módulo (ex.: nos testes) NUNCA
// dispara main()/process.exit() sozinho.
const isMain = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
