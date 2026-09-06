/**
 * Moderação (TDD §5.3). Filtro automático + fila humana p/ score 0.65–0.85.
 * MVP: aprova procedural; para imagens IA usa o safety_checker do provedor (já
 * ligado no fal) e aprova. Integração de moderação neural própria = próximo passo.
 */
export type ModerationStatus = "APPROVED" | "REVIEW" | "REJECTED";
export function moderate(hasBuffer: boolean): { status: ModerationStatus; score: number } {
  // Sem buffer (procedural) → aprovado (arte vetorial local, sem risco).
  if (!hasBuffer) return { status: "APPROVED", score: 0 };
  // IA: safety_checker do fal já roda no provedor; aprova aqui (score baixo).
  return { status: "APPROVED", score: 0.1 };
}
