/**
 * Prévia determinística no CLIENTE, usando o próprio motor genético (TDD §2:
 * "prévia offline"). Calcula, a partir só dos dois genótipos + pack:
 *   - distribuição fenotípica por loco (Punnett),
 *   - F de Wright (com o pedigree montado dos espécimes já carregados),
 *   - alertas de combinações letais (ex.: M/M).
 * A confirmação real (com seed e persistência) continua sendo da API.
 */

import {
  punnettPhenotypeLocus,
  punnettLocus,
  wrightF,
  CANINE_PACK,
  FELINE_PACK,
} from "@genbreedai/engine";
import type { Pedigree } from "@genbreedai/engine";
import type { ApiSpecimen, PackId } from "./api";

const PACKS = { canine: CANINE_PACK, feline: FELINE_PACK } as const;

export interface LocusPreview {
  locus: string;
  phenotypes: Array<{ label: string; p: number }>;
}

export interface LethalPreview {
  locus: string;
  label: string;
  p: number;
}

export interface CrossPreview {
  compatible: boolean;
  reason?: string;
  loci: LocusPreview[];
  fPedigree: number;
  lethals: LethalPreview[];
  interspecific: boolean;
}

function buildPedigree(all: ApiSpecimen[]): Pedigree {
  const ped: Pedigree = {};
  for (const s of all) ped[s.id] = { id: s.id, sire: s.sireId, dam: s.damId };
  return ped;
}

export function previewCross(
  sire: ApiSpecimen,
  dam: ApiSpecimen,
  all: ApiSpecimen[],
): CrossPreview {
  if (sire.pack !== dam.pack) {
    return {
      compatible: false,
      reason: `Espécies de packs distintos (${sire.pack} × ${dam.pack}).`,
      loci: [],
      fPedigree: 0,
      lethals: [],
      interspecific: true,
    };
  }
  const pack = PACKS[sire.pack as PackId];
  const sharedLoci = Object.keys(sire.genotype.loci).filter(
    (l) => dam.genotype.loci[l] !== undefined && pack.loci[l] !== undefined,
  );

  const loci: LocusPreview[] = sharedLoci.map((locus) => {
    const dist = punnettPhenotypeLocus(
      pack.loci[locus]!,
      sire.genotype.loci[locus]!,
      dam.genotype.loci[locus]!,
    );
    const phenotypes = [...dist.entries()]
      .map(([label, p]) => ({ label, p }))
      .sort((a, b) => b.p - a.p);
    return { locus, phenotypes };
  });

  // Alertas letais (probabilidade do genótipo letal aparecer).
  const lethals: LethalPreview[] = [];
  for (const lethal of pack.lethals) {
    const sp = sire.genotype.loci[lethal.locus];
    const dp = dam.genotype.loci[lethal.locus];
    if (!sp || !dp) continue;
    const key = [lethal.genotype[0], lethal.genotype[1]].sort().join("/");
    const p = punnettLocus(sp, dp).get(key) ?? 0;
    if (p > 0) lethals.push({ locus: lethal.locus, label: lethal.label, p });
  }

  const ped = buildPedigree(all);
  const fPedigree = wrightF(ped, sire.id, dam.id);

  return {
    compatible: true,
    loci,
    fPedigree: Number(fPedigree.toFixed(4)),
    lethals,
    interspecific: sire.species !== dam.species,
  };
}
