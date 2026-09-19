/**
 * `pnpm --filter @genbreedai/api push:dispatch` — avisa (Web Push) os jogadores cuja gestação
 * terminou (ADR-0028). Feito pra rodar num CRON EXTERNO do Railway a cada 5 minutos, para
 * sempre: sem cota, sem custo, sem imagem, idempotente (uma execução a mais não reenvia nada;
 * duas ao mesmo tempo avisam uma vez só). Lógica em `dispatch-ready.ts`; aqui só o `.env`,
 * a montagem dos repositórios e o código de saída.
 *
 * Precisa de `DATABASE_URL` (sem banco não há gestação a avisar) e das chaves VAPID
 * (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`; `VAPID_SUBJECT` opcional). Sem as chaves: imprime
 * que está desligado e sai com 0 sem marcar nada. Chaves definidas mas biblioteca `web-push`
 * não instalada: erro e saída 1 ANTES de reivindicar qualquer entrada.
 *
 * NUNCA termina em silêncio: sempre imprime ENCONTRADAS / AVISADAS / SEM ASSINATURA / FALHAS;
 * erro imprime a mensagem e sai com 1; se o processo encerrar sem concluir, o handler de
 * `exit` avisa e marca 1 (lição do backfill de miniaturas). Saída 1 também quando há FALHAS.
 */
import "dotenv/config"; // ANTES de tudo: as env (DATABASE_URL, VAPID_*) precisam estar carregadas
import { createDb } from "../db/client";
import { SystemClock } from "../common/clock";
import { vapidPartiallyConfigured } from "../common/vapid";
import { DrizzleIncubatorRepository } from "../incubator/drizzle.repository";
import { DrizzlePushSubscriptionRepository } from "./push-subscription.repository";
import { WebPushSender } from "./push-sender";
import { PushService } from "./push.service";
import { dispatchReady, type DispatchSummary } from "./dispatch-ready";

let finished = false;
process.on("exit", () => {
  if (!finished) {
    console.error("[push:dispatch] ENCERROU SEM CONCLUIR (nenhum resumo final) — trate como FALHA.");
    process.exitCode = 1;
  }
});

function fail(message: string): never {
  finished = true; // saída deliberada, com mensagem
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  console.log(`push:dispatch — ${new Date().toISOString()}`);

  if (vapidPartiallyConfigured()) {
    fail("[push:dispatch] ABORTADO — configuração PARCIAL das chaves VAPID: só uma de VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY está definida.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) fail("[push:dispatch] ABORTADO — DATABASE_URL não definida (o script só faz sentido contra o banco).");

  const { db, pool } = createDb(url);
  const clock = new SystemClock();
  const push = new PushService(new DrizzlePushSubscriptionRepository(db), new WebPushSender(), clock);

  let summary: DispatchSummary;
  try {
    summary = await dispatchReady({ incubator: new DrizzleIncubatorRepository(db), push, clock });
  } catch (e) {
    fail(`[push:dispatch] ERRO — ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    // Sem fechar o pool o processo NÃO termina (conexões abertas seguram o event loop) e o cron ficaria pendurado.
    await pool.end().catch(() => {});
  }

  if (summary.falhas > 0) process.exitCode = 1;
  finished = true;
  console.log("Terminado.");
}

main().catch((e) => {
  fail(`[push:dispatch] ERRO inesperado: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
});
