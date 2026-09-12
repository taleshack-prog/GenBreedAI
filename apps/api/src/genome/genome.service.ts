/**
 * Dados do Genoma detalhado (TDD §1.3/§8): árvore genealógica, fenótipo, QTL,
 * F de Wright DECOMPOSTO por ancestral comum, e origem dos alelos na linhagem
 * (responde "de onde veio cada alelo", ex.: as rosetas).
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import { expressPhenotype, explainWrightF, CANINE_PACK, FELINE_PACK, type WrightExplanation } from "@genbreedai/engine";
import type { Tier } from "@genbreedai/shared";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";

export interface LineageNode {
  id: string; species: string; generation: number; method: string;
  genotype: StoredSpecimen["genotype"]; aura: number; fPedigree: number;
  sire: LineageNode | null; dam: LineageNode | null;
}
export interface AlleleSource { locus: string; allele: string; sources: string[]; }
export interface GenomeResponse {
  specimen: StoredSpecimen;
  phenotype: ReturnType<typeof expressPhenotype>;
  lineage: LineageNode | null;
  fExplain: WrightExplanation;
  alleleSources: AlleleSource[];
  depth: number;
}

const DEPTH_BY_TIER: Record<Tier, number> = { FREE: 2, JUNIOR: 3, SENIOR: 7, PHD: 99 };

@Injectable()
export class GenomeService {
  constructor(private readonly repo: SpecimenRepository) {}

  private async tree(id: string | null, depth: number): Promise<LineageNode | null> {
    if (!id || depth < 0) return null;
    const s = await this.repo.get(id);
    if (!s) return null;
    return {
      id: s.id, species: s.species, generation: s.generation, method: s.method,
      genotype: s.genotype, aura: s.aura, fPedigree: s.fPedigree,
      sire: await this.tree(s.sireId, depth - 1),
      dam: await this.tree(s.damId, depth - 1),
    };
  }

  /** Para cada alelo do espécime, quais ancestrais na linhagem o carregam (mais próximos primeiro). */
  private traceAlleles(specimen: StoredSpecimen, root: LineageNode | null): AlleleSource[] {
    const flat: LineageNode[] = [];
    const walk = (n: LineageNode | null) => { if (!n) return; flat.push(n); walk(n.sire); walk(n.dam); };
    if (root) { walk(root.sire); walk(root.dam); } // ancestrais (exclui o próprio)
    const out: AlleleSource[] = [];
    for (const [locus, pair] of Object.entries(specimen.genotype.loci)) {
      for (const allele of new Set(pair.map((a) => a.replace("⟦mutação⟧", "")))) {
        const sources = flat
          .filter((n) => (n.genotype.loci[locus] ?? []).some((a) => a.replace("⟦mutação⟧", "") === allele))
          .map((n) => `${n.species} (${n.id})`);
        out.push({ locus, allele, sources: [...new Set(sources)].slice(0, 4) });
      }
    }
    return out;
  }

  async get(id: string, tier: Tier): Promise<GenomeResponse> {
    const s = await this.repo.get(id);
    if (!s) throw new NotFoundException(`Espécime ${id} não encontrado.`);
    const pack = s.pack === "canine" ? CANINE_PACK : FELINE_PACK;
    const phenotype = expressPhenotype({ loci: s.genotype.loci, qtl: {} }, pack);
    const depth = DEPTH_BY_TIER[tier] ?? 2;
    const lineage = await this.tree(s.id, depth);

    let fExplain: WrightExplanation = { total: s.fPedigree, paths: [], note: "Fundador — sem endogamia." };
    if (s.sireId && s.damId) {
      const ped = await this.repo.buildPedigree([s.sireId, s.damId]);
      fExplain = explainWrightF(ped, s.sireId, s.damId);
    }
    const alleleSources = this.traceAlleles(s, lineage);
    return { specimen: s, phenotype, lineage, fExplain, alleleSources, depth };
  }
}
