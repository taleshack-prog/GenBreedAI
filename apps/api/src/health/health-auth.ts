import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Autenticação da rota de health (ADR-0039): `Authorization: Bearer <MONITOR_TOKEN>`, comparação em TEMPO CONSTANTE. Compara os SHA-256 dos dois
 * lados (tamanho fixo), então nem o comprimento do token vaza pelo tempo. Sem cabeçalho, formato errado ou token errado → `false`.
 */
export function isValidBearer(authorization: string | undefined, expectedToken: string): boolean {
  if (!authorization) return false;
  const m = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!m) return false;
  const a = createHash("sha256").update(m[1]!).digest();
  const b = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(a, b);
}
