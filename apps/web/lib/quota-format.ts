/**
 * Texto de cota de cruzamento (ADR-0019) — fonte única, usado tanto na
 * mensagem de 429 quanto no Laboratório/Perfil (nunca reimplementado em
 * cada tela).
 */
import type { CrossQuotaInfo } from "./api";

/** "1 cruzamento a cada 7 dias" / "3 cruzamentos a cada 7 dias" / "1 por dia" / "3 por dia". */
export function crossQuotaLabel(q: Pick<CrossQuotaInfo, "limit" | "window">): string {
  if (q.window === "day") return `${q.limit} por dia`;
  return `${q.limit} cruzamento${q.limit === 1 ? "" : "s"} a cada 7 dias`;
}

/** "Próximo cruzamento em 17/09/2026, 14:32" (data e hora LOCAL do navegador) — null se ainda há cota. */
export function nextAvailableLabel(iso: string | null): string | null {
  if (!iso) return null;
  const when = new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return `Próximo cruzamento em ${when}`;
}
