/**
 * Segredo de assinatura do JWT (`AUTH_SECRET`). Antes, sem a variável a API
 * caía num padrão público NO REPOSITÓRIO (`dev-insecure-secret-change-me`) —
 * em 14/09 esse padrão chegou a assinar tokens de PRODUÇÃO, e qualquer um que
 * o conheça forja sessão de qualquer usuário. Regra agora:
 *
 *  - Em PRODUÇÃO (`NODE_ENV === "production"`) a API NÃO sobe sem um
 *    `AUTH_SECRET` válido: `assertAuthSecretForBoot()` (chamada por
 *    `buildApp()`) lança com mensagem clara, e `resolveAuthSecret()` (usada em
 *    toda assinatura/verificação) lança de novo se, por algum caminho, o boot
 *    tiver sido contornado — nunca cai no padrão. Falhar ao subir é melhor
 *    que subir inseguro.
 *  - Fora de produção (dev/teste/`NODE_ENV` indefinido) mantém o padrão pra
 *    não atrapalhar o desenvolvimento, com aviso no log 1x por processo.
 *
 * Regra de validade em produção (`authSecretProblem`):
 *  1. definida e sem espaço/quebra de linha nas pontas;
 *  2. ao menos 32 caracteres (`openssl rand -hex 32` dá 64);
 *  3. nada de valores óbvios/placeholder (o padrão antigo, "change-me",
 *     "insecure", "example", "placeholder", "your-secret", "default");
 *  4. ao menos 8 caracteres distintos (recusa "aaaa…", "1234…").
 */

export const INSECURE_DEV_AUTH_SECRET = "dev-insecure-secret-change-me";
export const MIN_AUTH_SECRET_LENGTH = 32;
const MIN_DISTINCT_CHARS = 8;
const WEAK_MARKERS = ["dev-insecure", "insecure", "change-me", "changeme", "placeholder", "your-secret", "your_secret", "example", "default"];

let warnedDefaultInUse = false;

/** Motivo pelo qual o valor NÃO serve em produção, ou `null` se serve. Pura (testável sem ambiente). */
export function authSecretProblem(raw: string | undefined): string | null {
  if (raw === undefined || raw === "") return "não está definida";
  if (raw !== raw.trim()) return "tem espaço ou quebra de linha no começo/fim (cole o valor sem eles)";
  if (raw.length < MIN_AUTH_SECRET_LENGTH) return `tem ${raw.length} caracteres — o mínimo é ${MIN_AUTH_SECRET_LENGTH}`;
  const lower = raw.toLowerCase();
  const marker = WEAK_MARKERS.find((m) => lower.includes(m));
  if (marker) return `é um valor óbvio/placeholder (contém "${marker}")`;
  if (new Set(raw).size < MIN_DISTINCT_CHARS) return `tem caracteres demais repetidos (menos de ${MIN_DISTINCT_CHARS} distintos)`;
  return null;
}

/** O segredo a usar pra assinar/verificar JWT. Produção inválida → lança (nunca cai no padrão). */
export function resolveAuthSecret(): string {
  const raw = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    const problem = authSecretProblem(raw);
    if (problem) {
      throw new Error(
        `[auth] AUTH_SECRET inválida em produção: ${problem}. A API se recusa a assinar JWT com um segredo fraco ou com o padrão de dev. ` +
          `Defina no ambiente (Railway → Variables) um valor forte e único, ex.: \`openssl rand -hex 32\`.`,
      );
    }
    return raw as string;
  }
  if (raw === undefined || raw === "") {
    if (!warnedDefaultInUse) {
      warnedDefaultInUse = true;
      // eslint-disable-next-line no-console
      console.warn("[auth] AUTH_SECRET não definida — usando o segredo PADRÃO de desenvolvimento (inseguro, público no repositório). OK só fora de produção; em produção a API não sobe assim.");
    }
    return INSECURE_DEV_AUTH_SECRET;
  }
  return raw;
}

/** Chamada no boot (`buildApp`): em produção lança se o segredo for inválido; fora dela só emite o aviso do padrão (1x por processo). */
export function assertAuthSecretForBoot(): void {
  resolveAuthSecret();
}

/** Só para testes: reseta o aviso "1x por processo". */
export function resetAuthSecretWarning(): void {
  warnedDefaultInUse = false;
}
