/**
 * Texto de cota de NASCIMENTO (ADR-0021 — era cota de revelação, ADR-0020;
 * era cota de cruzamento, ADR-0019; cruzar continua livre, ver gestar/nascer
 * incubator/page.tsx) — fonte única, usada tanto na mensagem de 429 quanto
 * no Laboratório/Perfil/Incubadora (nunca reimplementada em cada tela).
 *
 * "vaga" (o nome que o ADR-0021 usa pro slot de `birthQuota`) é consumida em
 * GESTAR, não em nascer — o nome das funções ficou "birth*" porque é o nome
 * do campo na API (`MyTier.birthQuota`), mas o texto pra humano fala em
 * "vaga"/"nascimento" (nunca "revelação" ou "cruzamento").
 */
import type { BirthQuotaInfo } from "./api";

/** "1 nascimento a cada 7 dias" / "3 nascimentos a cada 7 dias" / "1 por dia" / "3 por dia". */
export function birthQuotaLabel(q: Pick<BirthQuotaInfo, "limit" | "window">): string {
  if (q.window === "day") return `${q.limit} por dia`;
  return `${q.limit} nascimento${q.limit === 1 ? "" : "s"} a cada 7 dias`;
}

/** "Nascimentos: 1 de 3" (usado/limite — perfil, ADR-0021 item 4). */
export function birthUsageLabel(q: Pick<BirthQuotaInfo, "used" | "limit">): string {
  return `Nascimentos: ${q.used} de ${q.limit}`;
}

/** "Próxima vaga em 17/09/2026, 14:32" (data e hora LOCAL do navegador) — null se ainda há vaga. */
export function nextAvailableLabel(iso: string | null): string | null {
  if (!iso) return null;
  const when = new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return `Próxima vaga em ${when}`;
}
