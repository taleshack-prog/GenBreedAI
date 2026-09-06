/** Cálculos do Laboratório com probabilidades reais do motor (loci B/K/M/A). */
import { gameteFrequencies, punnettLocus, CANINE_PACK, FELINE_PACK } from "@genbreedai/engine";
import type { Genotype } from "@genbreedai/shared";
import type { ApiSpecimen } from "./api";
import { deriveAppearance, type Family } from "./appearance";

const packOf = (pack: string) => (pack === "canine" ? CANINE_PACK : FELINE_PACK);
export const familyOf = (pack: string): Family => (pack === "canine" ? "canine" : "feline");
const strip = (a: string) => a.replace("⟦mutação⟧", "");
const isHet = (p: [string, string]) => strip(p[0]) !== strip(p[1]);

function chooseLoci(sire: Genotype, dam: Genotype): string[] {
  const shared = Object.keys(sire.loci).filter((l) => dam.loci[l]);
  const seg = shared.filter((l) => isHet(sire.loci[l]!) || isHet(dam.loci[l]!));
  const bothHet = seg.filter((l) => isHet(sire.loci[l]!) && isHet(dam.loci[l]!));
  return [...bothHet, ...seg.filter((l) => !bothHet.includes(l))].slice(0, 2);
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
export interface GridCell { genotype: Genotype; prob: number; base: string }
export interface PunnettGrid { loci: string[]; cols: Gamete[]; rows: Gamete[]; cells: GridCell[][]; family: Family }
export function buildGrid(sire: ApiSpecimen, dam: ApiSpecimen): PunnettGrid {
  const loci = chooseLoci(sire.genotype, dam.genotype);
  const cols = gametes(sire.genotype, loci), rows = gametes(dam.genotype, loci);
  const family = familyOf(sire.pack);
  const cells = rows.map((r) => cols.map((c) => {
    const childLoci: Record<string, [string, string]> = {};
    for (const l of Object.keys(sire.genotype.loci)) {
      if (loci.includes(l)) childLoci[l] = [c.alleles[l]!, r.alleles[l]!];
      else childLoci[l] = [sire.genotype.loci[l]![0], dam.genotype.loci[l]?.[0] ?? sire.genotype.loci[l]![1]];
    }
    const genotype: Genotype = { loci: childLoci, qtl: sire.genotype.qtl };
    return { genotype, prob: c.prob * r.prob, base: deriveAppearance(family, genotype, true).base };
  }));
  return { loci, cols, rows, cells, family };
}
export interface Hybrid { genotype: Genotype; prob: number; label: string }
export function topHybrids(sire: ApiSpecimen, dam: ApiSpecimen, n = 3): Hybrid[] {
  const loci = Object.keys(sire.genotype.loci).filter((l) => dam.genotype.loci[l]);
  let combos: Array<{ loci: Record<string, [string, string]>; prob: number }> = [{ loci: {}, prob: 1 }];
  for (const locus of loci) {
    const dist = [...punnettLocus(sire.genotype.loci[locus]!, dam.genotype.loci[locus]!).entries()];
    const next: typeof combos = [];
    for (const cur of combos) for (const [key, p] of dist) { const [a, b] = key.split("/"); next.push({ loci: { ...cur.loci, [locus]: [a!, b!] }, prob: cur.prob * p }); }
    combos = next.sort((x, y) => y.prob - x.prob).slice(0, 24);
  }
  const qtl = sire.genotype.qtl;
  return combos.slice(0, n).map((c, i) => ({ genotype: { loci: c.loci, qtl }, prob: c.prob, label: `Híbrido ${i + 1}` }));
}
export function compatibility(sire: ApiSpecimen, dam: ApiSpecimen): number {
  const shared = Object.keys(sire.genotype.loci).filter((l) => dam.genotype.loci[l]);
  if (shared.length === 0) return 0;
  let sum = 0;
  for (const l of shared) { let het = 0; for (const [key, p] of punnettLocus(sire.genotype.loci[l]!, dam.genotype.loci[l]!)) { const [a, b] = key.split("/"); if (a !== b) het += p; } sum += het; }
  return Math.round((sum / shared.length) * 100);
}
export { packOf };
