/**
 * Texto de cota de REVELAÇÃO (ADR-0020 — era cota de cruzamento, ADR-0019;
 * cruzar agora é livre) — fonte única, usada tanto na mensagem de 429
 * quanto no Laboratório/Perfil/Incubadora (nunca reimplementada em cada tela).
 */
import type { RevealQuotaInfo } from "./api";

/** "1 revelação a cada 7 dias" / "3 revelações a cada 7 dias" / "1 por dia" / "3 por dia". */
export function revealQuotaLabel(q: Pick<RevealQuotaInfo, "limit" | "window">): string {
  if (q.window === "day") return `${q.limit} por dia`;
  return `${q.limit} revelaç${q.limit === 1 ? "ão" : "ões"} a cada 7 dias`;
}

/** "Revelações: 1 de 3" (usado/limite — perfil, ADR-0020 item 3). */
export function revealUsageLabel(q: Pick<RevealQuotaInfo, "used" | "limit">): string {
  return `Revelações: ${q.used} de ${q.limit}`;
}

/** "Próxima revelação em 17/09/2026, 14:32" (data e hora LOCAL do navegador) — null se ainda há cota. */
export function nextAvailableLabel(iso: string | null): string | null {
  if (!iso) return null;
  const when = new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return `Próxima revelação em ${when}`;
}
