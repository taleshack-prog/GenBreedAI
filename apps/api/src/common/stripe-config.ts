/**
 * Variáveis do Stripe no boot — mesmo lugar (`buildApp()`) e mesmo padrão de `common/auth-secret.ts`, `common/database-url.ts` e
 * `common/r2-config.ts`. Hoje, com `STRIPE_SECRET_KEY` definida:
 *  - sem `STRIPE_WEBHOOK_SECRET` o webhook responde 400: o jogador PAGA no Stripe e nada é creditado nem ativado (pacote, plano,
 *    recompensa de indicação) — e ninguém é avisado;
 *  - sem `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL` o Checkout usa o padrão de dev e manda o cliente de volta para `localhost:3000`.
 * Regra (ADR-0031, adendo 2):
 *
 *  1. PRODUÇÃO (`NODE_ENV === "production"`) com `STRIPE_SECRET_KEY` definida: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL` e
 *     `STRIPE_CANCEL_URL` são obrigatórias — faltando qualquer uma o boot FALHA.
 *  2. As duas URLs, em produção, precisam ser https e NÃO apontar para localhost (127.x, 0.0.0.0, ::1, *.localhost) nem ter
 *     espaço/quebra de linha. Só barra o que com certeza é erro; não confere o domínio.
 *  3. PRODUÇÃO sem `STRIPE_SECRET_KEY`: passa (billing desligado é escolha válida, ainda que improvável), com aviso 1x por processo.
 *  4. FORA de produção nada falha: só avisa (1x por processo) quando há `STRIPE_SECRET_KEY` e falta `STRIPE_WEBHOOK_SECRET`. As URLs
 *     não são conferidas: o padrão `localhost:3000` é o certo para dev.
 *
 * "Definida" para a chave = não vazia (a MESMA regra de `resolvePaymentProvider`, para o boot valer exatamente quando o billing
 * real está ligado); para as demais = não vazia depois de `trim()`. As mensagens citam só NOMES de variável — nunca valores
 * (há segredos e URLs de retorno). Só o boot da API HTTP chama isto; scripts de linha de comando (o `push-cron`, que não tem
 * variável do Stripe) nunca passam por aqui (`test/cli-boot-isolation.spec.ts`).
 */

export const STRIPE_URL_VARS = ["STRIPE_SUCCESS_URL", "STRIPE_CANCEL_URL"] as const;
export type StripeUrlVar = (typeof STRIPE_URL_VARS)[number];

const warned = new Set<string>();

const isSet = (v: string | undefined): boolean => v !== undefined && v.trim() !== "";

/** `true` quando o billing REAL está ligado (mesma condição de `resolvePaymentProvider`). */
export function stripeKeyActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.STRIPE_SECRET_KEY !== undefined && env.STRIPE_SECRET_KEY !== "";
}

const isLocalHost = (host: string): boolean => {
  const h = host.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0" || h === "[::1]" || h === "::1" || /^127\./.test(h);
};

/** Motivo pelo qual a URL NÃO serve em produção, ou `null` se serve. Pura; nunca devolve o valor. */
export function stripeUrlProblem(raw: string | undefined): string | null {
  if (!isSet(raw)) return "não está definida";
  if (/\s/.test(raw!)) return "tem espaço ou quebra de linha (cole o valor sem eles)";
  let url: URL;
  try { url = new URL(raw!); } catch { return "não é uma URL válida"; }
  if (isLocalHost(url.hostname)) return "aponta para localhost (o cliente pagaria e voltaria para a própria máquina)";
  if (url.protocol !== "https:") return "não usa https";
  return null;
}

export interface StripeProblem {
  name: "STRIPE_WEBHOOK_SECRET" | StripeUrlVar;
  /** `missing` = variável ausente; `invalid` = definida mas inaceitável em produção. */
  kind: "missing" | "invalid";
  text: string;
}

/** Problemas da configuração em PRODUÇÃO quando `STRIPE_SECRET_KEY` está definida (lista vazia se não está). Pura. */
export function stripeProductionProblems(env: NodeJS.ProcessEnv = process.env): StripeProblem[] {
  if (!stripeKeyActive(env)) return [];
  const out: StripeProblem[] = [];
  if (!isSet(env.STRIPE_WEBHOOK_SECRET)) {
    out.push({
      name: "STRIPE_WEBHOOK_SECRET", kind: "missing",
      text: "STRIPE_WEBHOOK_SECRET não está definida (o webhook responderia 400: o jogador pagaria no Stripe e nada seria creditado nem ativado)",
    });
  }
  for (const name of STRIPE_URL_VARS) {
    const p = stripeUrlProblem(env[name]);
    if (p) out.push({ name, kind: p === "não está definida" ? "missing" : "invalid", text: `${name} ${p}` });
  }
  return out;
}

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(message);
}

/**
 * Chamada no boot (`buildApp`). Em produção lança quando a chave está definida e a configuração é inaceitável; sem a chave só
 * avisa (1x por processo); fora de produção nunca lança. Nunca imprime valores.
 */
export function assertStripeForBoot(): void {
  const env = process.env;

  if (env.NODE_ENV === "production") {
    const problems = stripeProductionProblems(env);
    if (problems.length > 0) {
      throw new Error(
        `[billing] Stripe inválido em produção: ${problems.map((p) => p.text).join("; ")}. Com STRIPE_SECRET_KEY definida o billing está LIGADO: ` +
          `sem o segredo do webhook o cliente paga e nada é entregue, e URLs de retorno para localhost/http mandam o cliente para o lugar errado — ` +
          `por isso a API NÃO sobe. Defina no ambiente (Railway → Variables) STRIPE_WEBHOOK_SECRET e as URLs https de STRIPE_SUCCESS_URL e ` +
          `STRIPE_CANCEL_URL (ou, para desligar o billing, remova STRIPE_SECRET_KEY).`,
      );
    }
    if (!stripeKeyActive(env)) {
      const ignored = ["STRIPE_WEBHOOK_SECRET", ...STRIPE_URL_VARS].filter((k) => isSet(env[k]));
      warnOnce("prod-billing-off",
        "[billing] STRIPE_SECRET_KEY não definida — billing DESLIGADO: compras de pacote e assinaturas indisponíveis (provider stub, sem cobrança real) e o webhook responde 400." +
          (ignored.length ? ` ATENÇÃO: ${ignored.join(", ")} está(ão) definida(s) mas será(ão) IGNORADA(S) — a chave provavelmente sumiu.` : ""));
    }
    return;
  }

  // Fora de produção: nunca falha. Só avisa o caso que perderia pagamento (chave real sem segredo do webhook).
  if (stripeProductionProblems(env).some((p) => p.name === "STRIPE_WEBHOOK_SECRET")) {
    warnOnce("dev-webhook",
      "[billing] STRIPE_SECRET_KEY definida sem STRIPE_WEBHOOK_SECRET — pagamentos feitos no Stripe NÃO serão creditados (o webhook responde 400). " +
        "OK só fora de produção; em produção a API não sobe assim.");
  }
}

/** Só para testes: reseta os avisos "1x por processo". */
export function resetStripeWarnings(): void {
  warned.clear();
}
