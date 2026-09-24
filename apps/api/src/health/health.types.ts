/** Tipos do health check central (ADR-0039). O corpo NUNCA carrega segredo: só números e frases curtas. */
export type HealthStatus = "ok" | "degraded" | "down";

export interface HealthCheck { name: string; status: HealthStatus; detail: string }

export interface HealthSummary {
  app: "GenBreed";
  /** O PIOR entre os checks. */
  status: HealthStatus;
  /** Resumo do que não está ok (máx 200 caracteres); string vazia se tudo certo. */
  detail: string;
  /** ISO-8601 em UTC. */
  checked_at: string;
  checks: HealthCheck[];
}

const RANK: Record<HealthStatus, number> = { ok: 0, degraded: 1, down: 2 };

/** O pior status de uma lista (`ok` se vazia). */
export function worstStatus(statuses: readonly HealthStatus[]): HealthStatus {
  return statuses.reduce<HealthStatus>((worst, s) => (RANK[s] > RANK[worst] ? s : worst), "ok");
}

export const DETAIL_MAX = 200;

/** Resumo dos checks que NÃO estão ok, cortado em 200 caracteres ("" se todos ok). */
export function summarizeDetail(checks: readonly HealthCheck[]): string {
  const text = checks.filter((c) => c.status !== "ok").map((c) => `${c.name}: ${c.detail}`).join("; ");
  return text.length <= DETAIL_MAX ? text : `${text.slice(0, DETAIL_MAX - 1)}…`;
}
