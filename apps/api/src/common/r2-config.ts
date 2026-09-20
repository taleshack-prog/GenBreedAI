/**
 * Variáveis do R2 no boot — mesmo lugar (`buildApp()`) e mesmo padrão de `common/auth-secret.ts` e
 * `common/database-url.ts`. O storage de imagens (`images/storage.ts`) só usa o R2 com AS CINCO variáveis
 * (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`); faltando qualquer uma
 * ele cai no DISCO do contêiner e os retratos gerados somem no próximo deploy — a API sobe, tudo parece funcionar,
 * sem nenhum aviso. Regra (ADR-0031):
 *
 *  1. PRODUÇÃO (`NODE_ENV === "production"`) com `FAL_KEY` definida (a API vai GERAR e GUARDAR retratos): as cinco
 *     `R2_*` são obrigatórias — faltando qualquer uma o boot FALHA.
 *  2. PRODUÇÃO com configuração PARCIAL (1 a 4 das cinco): o boot falha MESMO sem `FAL_KEY` — é erro de digitação
 *     ou variável apagada, não escolha.
 *  3. PRODUÇÃO sem `FAL_KEY` e sem nenhuma `R2_*`: passa (modo procedural — nada é gerado nem guardado, o R2 é
 *     dispensável), com aviso no log 1x por processo.
 *  4. FORA de produção nada falha: só avisa (1x por processo) quando as imagens cairiam no disco local — dizendo que
 *     não persistem.
 *
 * SÓ o boot da API HTTP (`buildApp()` em `main.ts`) chama isto. Scripts de linha de comando (`push:dispatch` no cron do Railway, que
 * tem só DATABASE_URL e VAPID_*, `db:*`, `images:*`) NUNCA passam por aqui — cada um valida só o que usa. O teste
 * `test/cli-boot-isolation.spec.ts` garante isso pelo grafo de imports.
 *
 * As mensagens citam só os NOMES das variáveis — NUNCA os valores (há credenciais). "Definida" = não vazia depois de
 * `trim()`; whitespace em volta do valor é problema do storage/deploy, não desta checagem (que só barra ausência, para
 * não derrubar um deploy que hoje funciona).
 */

/** As cinco variáveis que o storage exige juntas para usar o R2. */
export const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
export type R2Var = (typeof R2_VARS)[number];

const warned = new Set<string>();

const isSet = (v: string | undefined): boolean => v !== undefined && v.trim() !== "";

export interface R2Status {
  /** Nomes das `R2_*` definidas. */
  present: R2Var[];
  /** Nomes das `R2_*` que faltam. */
  missing: R2Var[];
  /** As cinco definidas (o storage usará o R2). */
  complete: boolean;
  /** Nenhuma das cinco definida. */
  none: boolean;
  /** `FAL_KEY` definida (a API gera e guarda retratos de verdade). */
  falKey: boolean;
}

/** Pura sobre o `env` recebido (testável sem tocar em `process.env`). */
export function r2Status(env: NodeJS.ProcessEnv = process.env): R2Status {
  const present = R2_VARS.filter((k) => isSet(env[k]));
  const missing = R2_VARS.filter((k) => !isSet(env[k]));
  return { present, missing, complete: missing.length === 0, none: present.length === 0, falKey: isSet(env.FAL_KEY) };
}

const list = (names: readonly string[]) => names.join(", ");

/**
 * Motivo pelo qual a configuração NÃO serve em PRODUÇÃO, ou `null` se serve. Pura. Só nomes de variável na mensagem.
 * (`null` também no caso "sem FAL_KEY e sem R2": passa, com aviso — ver `assertR2ForBoot`.)
 */
export function r2ProductionProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = r2Status(env);
  if (s.complete) return null;
  if (!s.none) {
    return `configuração PARCIAL do R2: definidas ${list(s.present)}; FALTAM ${list(s.missing)}. Ou as cinco estão definidas, ou nenhuma (é provável erro de digitação ou variável apagada)`;
  }
  if (s.falKey) {
    return `FAL_KEY está definida (a API vai gerar retratos), mas NENHUMA das cinco variáveis do R2 está: FALTAM ${list(s.missing)}`;
  }
  return null;
}

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(message);
}

/**
 * Chamada no boot (`buildApp`). Em produção lança quando as regras 1 ou 2 são violadas; nos demais casos só avisa
 * (1x por processo) quando faz sentido (regras 3 e 4). Nunca imprime valores.
 */
export function assertR2ForBoot(): void {
  const env = process.env;
  const s = r2Status(env);

  if (env.NODE_ENV === "production") {
    const problem = r2ProductionProblem(env);
    if (problem) {
      throw new Error(
        `[storage] R2 inválido em produção: ${problem}. Sem as cinco variáveis o storage cai no DISCO do contêiner e os retratos ` +
          `gerados SOMEM no próximo deploy, sem nenhum aviso — por isso a API NÃO sobe. Defina no ambiente (Railway → Variables) ` +
          `R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET e R2_PUBLIC_URL (ou, para o modo procedural, remova FAL_KEY e todas as R2_*).`,
      );
    }
    if (s.none && !s.falKey) {
      warnOnce("prod-procedural",
        "[storage] modo PROCEDURAL: FAL_KEY e R2_* não definidas — nenhum retrato é gerado nem guardado (o R2 é dispensável). " +
          "Para gerar retratos defina FAL_KEY e as cinco R2_* (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL).");
    }
    return;
  }

  // Fora de produção: nunca falha. Só avisa quando as imagens cairiam no disco local (FAL_KEY gera e grava, ou R2 parcial).
  if (!s.complete && (s.falKey || !s.none)) {
    warnOnce("dev-disk",
      `[storage] R2 incompleto (${s.none ? "nenhuma R2_* definida" : `faltam ${list(s.missing)}`}) — as imagens geradas serão gravadas no DISCO LOCAL ` +
        "e NÃO persistem (somem a cada deploy/reinício). OK só fora de produção; em produção a API não sobe assim.");
  }
}

/** Só para testes: reseta os avisos "1x por processo". */
export function resetR2Warnings(): void {
  warned.clear();
}
