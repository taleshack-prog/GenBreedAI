/** Helpers da tela Híbrido Revelado (loci B/K/M/A). */
import { expressPhenotype, CANINE_PACK, FELINE_PACK } from "@genbreedai/engine";
import type { ApiSpecimen } from "./api";
export interface Rarity { label: string; color: string; tier: number }
export function rarityOf(aura: number): Rarity {
  if (aura >= 5) return { label: "LENDÁRIO", color: "#FFC107", tier: 5 };
  if (aura >= 4) return { label: "RARO", color: "#BF00FF", tier: 4 };
  if (aura >= 3) return { label: "INCOMUM", color: "#00F0FF", tier: 3 };
  return { label: "COMUM", color: "#9E9E9E", tier: aura };
}
export function phenotypeOf(s: ApiSpecimen) {
  const pack = s.pack === "canine" ? CANINE_PACK : FELINE_PACK;
  return expressPhenotype({ loci: s.genotype.loci, qtl: {} }, pack);
}
export const METHOD_LABEL: Record<string, string> = {
  F1: "F1 · Primeira geração", F2: "F2 · Intercruzamento", F3: "F3 · Terceira geração",
  BC1: "BC1 · Retrocruzamento", LINE: "Line-breeding", INBREED: "Endocruzamento",
  OUTCROSS: "Outcross de resgate", FOUNDER: "Fundador",
};
