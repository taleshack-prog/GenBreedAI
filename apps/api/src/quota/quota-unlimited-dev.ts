/**
 * Flag de DEV/TESTE que ignora TODA cota (`QuotaService.reserve()` não
 * distingue `kind` — vale tanto pro limite horário de cruzar quanto pra
 * `birthQuota`, ADR-0021).
 *
 * Nome NOVO: `QUOTA_UNLIMITED_DEV` — o nome antigo, `CROSS_QUOTA_UNLIMITED`
 * (ADR-0019), enganava: dava a entender que só desligava a cota de
 * cruzamento, quando na verdade sempre desligou as duas. Continua aceito
 * por COMPATIBILIDADE (mesmo efeito), com aviso de depreciação — 1x por
 * processo, nunca a cada chamada de `reserve()` (isso spammaria o log a
 * cada cruzamento/revelação).
 *
 * Em produção (`NODE_ENV === "production"`), a flag é SEMPRE ignorada —
 * mesmo definida, mesmo com qualquer um dos dois nomes — de propósito:
 * ninguém deve conseguir "ligar sem querer" isso em prod e derrubar a cota
 * de verdade. Também loga um aviso, 1x por processo, quando isso acontece
 * (flag definida mas ignorada) — visibilidade de que uma env var perigosa
 * está presente no ambiente de produção, mesmo sem efeito.
 */
let warnedProdIgnored = false;
let warnedDeprecatedName = false;

export function isQuotaUnlimitedDev(): boolean {
  const usingNewName = process.env.QUOTA_UNLIMITED_DEV === "true";
  const usingOldName = process.env.CROSS_QUOTA_UNLIMITED === "true";
  if (!usingNewName && !usingOldName) return false;

  if (process.env.NODE_ENV === "production") {
    if (!warnedProdIgnored) {
      warnedProdIgnored = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[quota] QUOTA_UNLIMITED_DEV (ou o nome antigo CROSS_QUOTA_UNLIMITED) está definida no ambiente, mas foi IGNORADA — NODE_ENV=production nunca libera cota, de propósito.",
      );
    }
    return false;
  }

  if (usingOldName && !warnedDeprecatedName) {
    warnedDeprecatedName = true;
    // eslint-disable-next-line no-console
    console.warn("[quota] CROSS_QUOTA_UNLIMITED está DEPRECIADA — use QUOTA_UNLIMITED_DEV (mesmo efeito, nome novo).");
  }
  return true;
}

/** Só para testes: reseta os avisos "1x por processo" entre casos de teste. */
export function resetQuotaUnlimitedDevWarnings(): void {
  warnedProdIgnored = false;
  warnedDeprecatedName = false;
}
