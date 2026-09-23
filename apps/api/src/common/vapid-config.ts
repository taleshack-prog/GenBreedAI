/**
 * Chaves VAPID no boot (ADR-0028/0031) — mesmo lugar (`buildApp()`) e padrão dos demais `assert…ForBoot()`. O Web Push só existe
 * com AS DUAS chaves (`VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`, ver `common/vapid.ts`). Regra:
 *
 *  - As duas definidas ou nenhuma definida: passa (nenhuma = recurso desligado, escolha válida, sem aviso).
 *  - SÓ UMA definida: em PRODUÇÃO o boot FALHA (é erro de deploy — o recurso desligaria em silêncio e o `push:dispatch` abortaria);
 *    fora de produção só avisa, 1x por processo.
 *
 * "Definida" = não vazia depois de `trim()` (a mesma regra de `vapidConfig()`). Mensagens só com NOMES de variável — nunca valores
 * (a privada é segredo). Só o boot da API HTTP chama isto: o script `push:dispatch` (cron) tem a própria checagem de VAPID pela
 * metade e NUNCA passa por aqui (`test/cli-boot-isolation.spec.ts`).
 */
import { vapidPartiallyConfigured } from "./vapid";

const warned = new Set<string>();

/** Motivo (só nomes) pelo qual a configuração é PARCIAL, ou `null` se está completa/ausente. Pura sobre o `env` recebido. */
export function vapidProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const hasPub = Boolean(env.VAPID_PUBLIC_KEY?.trim());
  const hasPriv = Boolean(env.VAPID_PRIVATE_KEY?.trim());
  if (hasPub === hasPriv) return null;
  return `configuração PARCIAL das chaves VAPID: ${hasPub ? "VAPID_PUBLIC_KEY" : "VAPID_PRIVATE_KEY"} definida, FALTA ${hasPub ? "VAPID_PRIVATE_KEY" : "VAPID_PUBLIC_KEY"}`;
}

/** Chamada no boot (`buildApp`): em produção lança se só uma das chaves estiver definida; fora dela só avisa (1x por processo). */
export function assertVapidForBoot(): void {
  if (!vapidPartiallyConfigured()) return;
  const problem = vapidProblem() as string;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[push] VAPID inválido em produção: ${problem}. Ou as duas chaves estão definidas, ou nenhuma (é provável erro de deploy ou variável ` +
        `apagada — o Web Push ficaria desligado em silêncio e o cron push:dispatch abortaria) — por isso a API NÃO sobe. Defina no ambiente ` +
        `(Railway → Variables) VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY (ou, para desligar o push, remova as duas).`,
    );
  }
  if (!warned.has("dev-partial")) {
    warned.add("dev-partial");
    // eslint-disable-next-line no-console
    console.warn(`[push] ${problem} — o Web Push fica DESLIGADO. OK só fora de produção; em produção a API não sobe assim.`);
  }
}

/** Só para testes: reseta o aviso "1x por processo". */
export function resetVapidWarnings(): void {
  warned.clear();
}
