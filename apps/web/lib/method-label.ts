/**
 * Rótulo de exibição de `method` (BreedingMethod | "FOUNDER") — FONTE ÚNICA.
 * Antes havia 4 tabelas locais com textos diferentes pro mesmo método
 * (reveal.ts, crosses/page.tsx, SpecimenCard.tsx, AscendancyTree.tsx) — nunca
 * reimplementar, sempre importar `methodLabel` daqui.
 *
 * `variant`: "long" (padrão) pra espaço sobrando (card de revelação, card de
 * espécime); "short" só onde o texto já era curto por falta de espaço
 * (listas/árvores compactas).
 */
const LONG: Record<string, string> = {
  F1: "F1 · Primeira geração",
  F2: "F2 · Intercruzamento",
  F3: "F3 · Terceira geração",
  BC1: "BC1 · Retrocruzamento",
  LINE: "Cruzamento em linha",
  INBREED: "Endocruzamento",
  OUTCROSS: "Outcross de resgate",
  FOUNDER: "Fundador",
};

const SHORT: Record<string, string> = {
  F1: "F1",
  F2: "F2",
  F3: "F3",
  BC1: "BC1",
  LINE: "Linha",
  INBREED: "Endogamia",
  OUTCROSS: "Outcross",
  FOUNDER: "Fundador",
};

/** Método desconhecido (fora da tabela) → devolve o próprio valor, sem quebrar. */
export function methodLabel(method: string, variant: "long" | "short" = "long"): string {
  const table = variant === "short" ? SHORT : LONG;
  return table[method] ?? method;
}
