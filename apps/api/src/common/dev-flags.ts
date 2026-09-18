/**
 * Flags de DESENVOLVIMENTO/TESTE — um lugar só (antes cada uma repetia, ou
 * esquecia, a proteção). Regra: em produção (`NODE_ENV === "production"`) a
 * flag é SEMPRE ignorada, mesmo definida como "true", com um aviso no log 1x
 * por processo (nunca silenciosamente). Assim ninguém "liga sem querer" no
 * Railway algo que:
 *  - `AUTH_DEV_HEADERS`     — aceita `x-user-id` sem senha/JWT e `x-user-tier`
 *                             declarando tier pago sem assinatura (qualquer um
 *                             vira PhD de graça);
 *  - `QUOTA_UNLIMITED_DEV`  — desliga TODA cota (60/h de cruzar e vagas de
 *                             nascimento); alias depreciado `CROSS_QUOTA_UNLIMITED`;
 *  - `IMAGE_QUOTA_UNLIMITED`— a cota mensal de retratos extras deixa de valer
 *                             (gasto de fal.ai sem teto);
 *  - `BILLING_STUB_ENABLED` — habilita `POST /billing/confirm` (confirmação
 *                             manual): sem Stripe, aprova qualquer pagamento
 *                             sem cobrar; com Stripe, ainda deixa o chamador
 *                             creditar a PRÓPRIA carteira com o `intentId` de
 *                             qualquer sessão paga.
 *
 * Fora de produção (dev, "test" ou `NODE_ENV` indefinido) a flag vale
 * exatamente como antes: só quando a env é a string "true".
 */

const warnedProdIgnored = new Set<string>();
const warnedDeprecatedAlias = new Set<string>();

export interface DevFlagOptions {
  /** Nomes ANTIGOS ainda aceitos (mesmo efeito, com aviso de depreciação 1x por processo). */
  deprecatedAliases?: readonly string[];
}

/** `true` só se a flag (ou um alias depreciado) for "true" E não for produção. */
export function isDevFlagEnabled(name: string, opts: DevFlagOptions = {}): boolean {
  const aliases = opts.deprecatedAliases ?? [];
  const nameOn = process.env[name] === "true";
  const aliasesOn = aliases.filter((a) => process.env[a] === "true");
  if (!nameOn && aliasesOn.length === 0) return false;

  if (process.env.NODE_ENV === "production") {
    if (!warnedProdIgnored.has(name)) {
      warnedProdIgnored.add(name);
      const alt = aliases.length > 0 ? ` (ou o nome antigo ${aliases.join("/")})` : "";
      // eslint-disable-next-line no-console
      console.warn(`[dev-flag] ${name}${alt} está definida no ambiente, mas foi IGNORADA — NODE_ENV=production nunca a liga, de propósito. Remova-a do ambiente de produção.`);
    }
    return false;
  }

  for (const a of aliasesOn) {
    if (!warnedDeprecatedAlias.has(a)) {
      warnedDeprecatedAlias.add(a);
      // eslint-disable-next-line no-console
      console.warn(`[dev-flag] ${a} está DEPRECIADA — use ${name} (mesmo efeito, nome novo).`);
    }
  }
  return true;
}

/** Só para testes: reseta os avisos "1x por processo" entre casos. */
export function resetDevFlagWarnings(): void {
  warnedProdIgnored.clear();
  warnedDeprecatedAlias.clear();
}
