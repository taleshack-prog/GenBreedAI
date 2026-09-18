/**
 * Flag de DEV/TESTE que ignora TODA cota (`QuotaService.reserve()` não
 * distingue `kind` — vale tanto pro limite horário de cruzar quanto pra
 * `birthQuota`, ADR-0021).
 *
 * Nome NOVO: `QUOTA_UNLIMITED_DEV` — o nome antigo, `CROSS_QUOTA_UNLIMITED`
 * (ADR-0019), enganava: dava a entender que só desligava a cota de
 * cruzamento, quando na verdade sempre desligou as duas. Continua aceito
 * por COMPATIBILIDADE (mesmo efeito), com aviso de depreciação 1x por processo.
 *
 * Em produção (`NODE_ENV === "production"`) a flag é SEMPRE ignorada, com
 * aviso 1x por processo. A lógica (produção ignora + avisos + alias) mora em
 * `common/dev-flags.ts` (`isDevFlagEnabled`), compartilhada com
 * `AUTH_DEV_HEADERS`, `IMAGE_QUOTA_UNLIMITED` e `BILLING_STUB_ENABLED`.
 */
import { isDevFlagEnabled, resetDevFlagWarnings } from "../common/dev-flags";

export function isQuotaUnlimitedDev(): boolean {
  return isDevFlagEnabled("QUOTA_UNLIMITED_DEV", { deprecatedAliases: ["CROSS_QUOTA_UNLIMITED"] });
}

/** Só para testes: reseta os avisos "1x por processo" entre casos de teste. */
export function resetQuotaUnlimitedDevWarnings(): void {
  resetDevFlagWarnings();
}
