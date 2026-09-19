/**
 * Núcleo do `push:dispatch` (ADR-0028) — sem `dotenv`, sem `process.exit`, sem `main()`:
 * importável nos testes. O script executável é `dispatch-ready-cli.ts`.
 *
 * Roda a cada 5 minutos (cron externo do Railway). Acha as gestações que TERMINARAM
 * (`gestation_ends_at <= agora`), que o jogador ainda NÃO fez nascer e que ainda NÃO foram
 * avisadas; reivindica cada uma (`ready_notified_at`, UPDATE ... RETURNING atômico — duas
 * execuções simultâneas avisam uma vez só) e envia o push "Gestação concluída" ao dono, em
 * TODOS os dispositivos dele. Sem cota, sem custo, sem imagem: só lê o banco e chama o
 * serviço de push. Idempotente: rodar de novo não reenvia nada.
 *
 * Decisões que importam:
 *  - A reivindicação marca a entrada MESMO se o dono não tem assinatura de push (contam
 *    como "sem assinatura"): senão, ao assinar depois, ele receberia um aviso velho de
 *    uma gestação que terminou há tempos.
 *  - É "no máximo uma vez": a entrada é marcada ANTES do envio. Se o envio falhar
 *    (rede, 5xx), o aviso daquela entrada se perde e conta em FALHAS — preferível a
 *    reenviar notificação repetida a cada 5 minutos.
 *  - Entrada que o jogador já fez nascer NÃO é candidata (o repositório filtra
 *    `born_specimen_id IS NULL`).
 *  - Se o envio é impossível (sem chaves VAPID → desligado, nada é marcado; sem a
 *    biblioteca `web-push` → LANÇA antes de reivindicar), nenhuma entrada é consumida.
 *  - Um usuário com várias gestações vencidas na mesma rodada recebe UM push só.
 *  - Nunca termina em silêncio: o resumo é sempre impresso.
 */
import { phenoSummary } from "@genbreedai/shared";
import type { Clock } from "../common/clock";
import { isPushEnabled } from "../common/vapid";
import type { IncubatorRepository, StoredIncubatorEntry } from "../incubator/in-memory.repository";
import type { PushPayload } from "./push-sender";
import type { PushService } from "./push.service";

export const NOTIFICATION_TITLE = "Gestação concluída";
/** Clique na notificação → abre a Incubadora (a web resolve o caminho na mesma origem). */
export const NOTIFICATION_URL = "/app/incubadora";
export const NOTIFICATION_ICON = "/icon-192.png";
/** Entradas reivindicadas por consulta; o script repete até acabar (com teto de segurança). */
export const CLAIM_BATCH = 200;
export const MAX_BATCHES = 50;

/** Corpo = nome do fenótipo (o mesmo texto do card na Incubadora); vários prontos → o primeiro + a contagem. */
export function buildPayload(entries: StoredIncubatorEntry[]): PushPayload {
  const first = phenoSummary(entries[0]!.phenotype.loci);
  const body = entries.length === 1 ? first : `${first} e mais ${entries.length - 1} prontos para nascer`;
  return { title: NOTIFICATION_TITLE, body, icon: NOTIFICATION_ICON, url: NOTIFICATION_URL, tag: `gestacao-${entries[0]!.id}` };
}

export interface DispatchSummary {
  /** `true` = Web Push desligado (sem VAPID): nada foi reivindicado nem enviado. */
  disabled: boolean;
  /** Entradas reivindicadas nesta execução (gestação vencida, não nascida, não avisada). */
  encontradas: number;
  /** Dessas, as que chegaram a pelo menos um dispositivo do dono. */
  avisadas: number;
  /** Dessas, as de donos sem nenhuma assinatura (ou cujos dispositivos todos sumiram, 404/410). Não é falha. */
  semAssinatura: number;
  /** Dessas, as que NÃO chegaram a nenhum dispositivo por erro (rede, 5xx, chave). O aviso se perde. */
  falhas: number;
  /** Assinaturas apagadas nesta execução por 404/410. */
  assinaturasRemovidas: number;
  /** Donos distintos processados. */
  usuarios: number;
}

export interface DispatchDeps {
  incubator: IncubatorRepository;
  push: PushService;
  clock: Clock;
}

const emptySummary = (disabled: boolean): DispatchSummary => (
  { disabled, encontradas: 0, avisadas: 0, semAssinatura: 0, falhas: 0, assinaturasRemovidas: 0, usuarios: 0 }
);

export function summaryLines(s: DispatchSummary): string[] {
  return [
    `ENCONTRADAS: ${s.encontradas} | AVISADAS: ${s.avisadas} | SEM ASSINATURA: ${s.semAssinatura} | FALHAS: ${s.falhas}`,
    `Usuários: ${s.usuarios} | Assinaturas removidas (404/410): ${s.assinaturasRemovidas}`,
  ];
}

/**
 * Lança se o envio for IMPOSSÍVEL com as chaves definidas (biblioteca `web-push` ausente) —
 * e isso acontece ANTES de reivindicar qualquer entrada. Sem chaves VAPID NÃO lança: devolve
 * `disabled` (estado legítimo, nada é consumido).
 */
export async function dispatchReady(deps: DispatchDeps, log: (line: string) => void = console.log): Promise<DispatchSummary> {
  if (!isPushEnabled()) {
    log("Web Push DESLIGADO (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não definidas) — nada feito; nenhuma entrada foi marcada.");
    for (const line of summaryLines(emptySummary(true))) log(line);
    return emptySummary(true);
  }
  await deps.push.ready(); // lança se a biblioteca não está instalada — antes de consumir qualquer entrada

  const summary = emptySummary(false);
  const owners = new Set<string>();

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const claimed = await deps.incubator.claimReadyForNotification(deps.clock.now(), CLAIM_BATCH);
    if (claimed.length === 0) break;
    summary.encontradas += claimed.length;

    const byOwner = new Map<string, StoredIncubatorEntry[]>();
    for (const e of claimed) {
      const list = byOwner.get(e.ownerId);
      if (list) list.push(e); else byOwner.set(e.ownerId, [e]);
    }

    for (const [ownerId, entries] of byOwner) {
      owners.add(ownerId);
      const r = await deps.push.sendToUser(ownerId, buildPayload(entries));
      summary.assinaturasRemovidas += r.removed;
      if (r.error) {
        summary.falhas += entries.length;
        log(`  usuário ${ownerId}: FALHA ao ler assinaturas — ${r.error}`);
      } else if (r.sent > 0) {
        summary.avisadas += entries.length;
      } else if (r.failed > 0) {
        summary.falhas += entries.length;
        log(`  usuário ${ownerId}: FALHA — ${r.failed} dispositivo(s) recusaram o envio`);
      } else {
        summary.semAssinatura += entries.length; // sem assinatura, ou todas sumiram (404/410)
      }
    }
    if (claimed.length < CLAIM_BATCH) break;
  }

  summary.usuarios = owners.size;
  for (const line of summaryLines(summary)) log(line);
  return summary;
}
