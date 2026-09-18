/** Cálculos do Laboratório com probabilidades reais do motor (loci B/K/M/A). */
import { gameteFrequencies, punnettLocus, CANINE_PACK, FELINE_PACK } from "@genbreedai/engine";
import type { Genotype } from "@genbreedai/shared";
import type { ApiSpecimen } from "./api";

/** Antes vinha de "./appearance" (desenho procedural, removido) — só o tipo sobrevive, ainda usado por PunnettGrid. */
export type Family = "feline" | "canine";

const packOf = (pack: string) => (pack === "canine" ? CANINE_PACK : FELINE_PACK);
export const familyOf = (pack: string): Family => (pack === "canine" ? "canine" : "feline");
const strip = (a: string) => a.replace("⟦mutação⟧", "");
const isHet = (p: [string, string]) => strip(p[0]) !== strip(p[1]);

/**
 * Classifica os loci compartilhados pelos pais em 3 grupos, pro Quadro de
 * Punnett (mostra só até 2 dimensões — senão a grade width×height explode):
 *  - `shown`: os até-2 loci que entram no quadro (prioriza os HET nos DOIS
 *    pais — mais informativos — depois os HET em só um).
 *  - `fixed`: loci onde NENHUM pai é heterozigoto nele mesmo — prole 100%
 *    determinística nesse loco (sem variação possível, mesmo que os pais
 *    não sejam literalmente idênticos: B/B × b/b também não segrega, dá
 *    sempre B/b). Não aparecem no quadro porque não têm o que mostrar.
 *  - `extraSegregating`: loci que SEGREGAM de verdade (pelo menos um pai
 *    heterozigoto) mas ficaram de fora só pelo limite de 2 — diferente de
 *    `fixed`, aqui HÁ variação, só não cabe no quadro.
 */
export interface LocusSegregation { shown: string[]; fixed: string[]; extraSegregating: string[] }
function classifyLoci(sire: Genotype, dam: Genotype): LocusSegregation {
  const shared = Object.keys(sire.loci).filter((l) => dam.loci[l]);
  const seg = shared.filter((l) => isHet(sire.loci[l]!) || isHet(dam.loci[l]!));
  const fixed = shared.filter((l) => !seg.includes(l));
  const bothHet = seg.filter((l) => isHet(sire.loci[l]!) && isHet(dam.loci[l]!));
  const ordered = [...bothHet, ...seg.filter((l) => !bothHet.includes(l))];
  return { shown: ordered.slice(0, 2), fixed, extraSegregating: ordered.slice(2) };
}
export interface Gamete { label: string; alleles: Record<string, string>; prob: number }
function gametes(g: Genotype, loci: string[]): Gamete[] {
  let out: Gamete[] = [{ label: "", alleles: {}, prob: 1 }];
  for (const locus of loci) {
    const freqs = [...gameteFrequencies(g.loci[locus]!).entries()];
    const next: Gamete[] = [];
    for (const cur of out) for (const [al, p] of freqs) next.push({ label: cur.label + strip(al), alleles: { ...cur.alleles, [locus]: al }, prob: cur.prob * p });
    out = next;
  }
  return out;
}
export interface GridCell { genotype: Genotype; prob: number }
export interface PunnettGrid {
  loci: string[]; cols: Gamete[]; rows: Gamete[]; cells: GridCell[][]; family: Family;
  /** Loci sem variação possível (nenhum pai heterozigoto nele) — por isso não aparecem no quadro. */
  fixedLoci: string[];
  /** Loci que segregam de verdade mas ficaram de fora só pelo limite de 2 do quadro. */
  extraSegregatingLoci: string[];
}
export function buildGrid(sire: ApiSpecimen, dam: ApiSpecimen): PunnettGrid {
  const { shown: loci, fixed: fixedLoci, extraSegregating: extraSegregatingLoci } = classifyLoci(sire.genotype, dam.genotype);
  const cols = gametes(sire.genotype, loci), rows = gametes(dam.genotype, loci);
  const family = familyOf(sire.pack);
  const cells = rows.map((r) => cols.map((c) => {
    const childLoci: Record<string, [string, string]> = {};
    for (const l of Object.keys(sire.genotype.loci)) {
      if (loci.includes(l)) childLoci[l] = [c.alleles[l]!, r.alleles[l]!];
      else childLoci[l] = [sire.genotype.loci[l]![0], dam.genotype.loci[l]?.[0] ?? sire.genotype.loci[l]![1]];
    }
    const genotype: Genotype = { loci: childLoci, qtl: sire.genotype.qtl };
    return { genotype, prob: c.prob * r.prob };
  }));
  return { loci, cols, rows, cells, family, fixedLoci, extraSegregatingLoci };
}
export function compatibility(sire: ApiSpecimen, dam: ApiSpecimen): number {
  const shared = Object.keys(sire.genotype.loci).filter((l) => dam.genotype.loci[l]);
  if (shared.length === 0) return 0;
  let sum = 0;
  for (const l of shared) { let het = 0; for (const [key, p] of punnettLocus(sire.genotype.loci[l]!, dam.genotype.loci[l]!)) { const [a, b] = key.split("/"); if (a !== b) het += p; } sum += het; }
  return Math.round((sum / shared.length) * 100);
}
export { packOf };
