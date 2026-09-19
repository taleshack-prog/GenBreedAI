/**
 * `DATABASE_URL` no boot — mesmo lugar (`buildApp()`) e mesmo padrão de
 * `common/auth-secret.ts`. Sem a variável TODO módulo cai nos repositórios em
 * MEMÓRIA: a API sobe "normal" e parece funcionar, mas nada persiste — cadastros,
 * espécimes, carteira, assinaturas somem a cada reinício, sem aviso nenhum. Se a
 * variável sumir do Railway, a perda seria silenciosa. Regra agora:
 *
 *  - Em PRODUÇÃO (`NODE_ENV === "production"`) a API NÃO sobe sem uma
 *    `DATABASE_URL` válida: `assertDatabaseForBoot()` lança com mensagem clara.
 *  - Fora de produção (dev/teste/`NODE_ENV` indefinido) mantém o modo em
 *    memória, com aviso no log 1x por processo dizendo que os dados NÃO persistem.
 *
 * "Válida" em produção (`databaseUrlProblem`) é deliberadamente frouxa — só barra
 * o que com certeza é erro: definida, sem espaço/quebra de linha, começando em
 * `postgres://` ou `postgresql://`. Não faz `new URL()` (uma senha com caracteres
 * especiais sem escape que o `pg` aceita não pode virar um falso positivo que
 * derrube o deploy) e nunca imprime o valor (tem senha).
 */

let warnedInMemory = false;

/** Motivo pelo qual o valor NÃO serve em produção, ou `null` se serve. Pura (testável sem ambiente). */
export function databaseUrlProblem(raw: string | undefined): string | null {
  if (raw === undefined || raw === "") return "não está definida";
  if (/\s/.test(raw)) return "tem espaço ou quebra de linha (cole o valor sem eles)";
  if (!/^postgres(ql)?:\/\/./i.test(raw)) return "não começa com postgres:// nem postgresql://";
  return null;
}

/** Chamada no boot (`buildApp`): em produção lança se a URL for inválida; fora dela só avisa que o modo é em memória (1x por processo). */
export function assertDatabaseForBoot(): void {
  const raw = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === "production") {
    const problem = databaseUrlProblem(raw);
    if (problem) {
      throw new Error(
        `[db] DATABASE_URL inválida em produção: ${problem}. Sem ela a API usaria repositórios em MEMÓRIA (os dados somem a cada reinício, ` +
          `sem nenhum aviso) — por isso ela NÃO sobe. Defina no ambiente (Railway → Variables) a URL do Postgres (Neon).`,
      );
    }
    return;
  }
  if ((raw === undefined || raw === "") && !warnedInMemory) {
    warnedInMemory = true;
    // eslint-disable-next-line no-console
    console.warn("[db] DATABASE_URL não definida — usando repositórios em MEMÓRIA: os dados NÃO persistem (somem a cada reinício). OK só fora de produção; em produção a API não sobe assim.");
  }
}

/** Só para testes: reseta o aviso "1x por processo". */
export function resetDatabaseWarning(): void {
  warnedInMemory = false;
}
