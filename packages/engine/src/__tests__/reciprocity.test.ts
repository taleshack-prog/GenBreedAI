/**
 * Reciprocidade (ADR-0013 — Etapa 2a). Sexo é universal e cruzamentos
 * recíprocos podem diferir, MAS só pelos mecanismos biológicos ligados ao
 * sexo (X-linkage). PROIBIDO diferença recíproca em loci AUTOSSÔMICOS:
 * "collie" M × "dogo" F e o inverso têm que dar a MESMA distribuição de cor
 * (B/K/A/E/R/S) dentro do erro amostral — trocar quem é sire/dam não pode
 * enviesar loci autossômicos.
 */
import { describe, it, expect } from "vitest";
import { cross, CANINE_PACK, type ParentInput } from "../index";
import { BOERBOEL, BRACO_ALEMAO } from "./fixtures";

const N = 10_000;
const AUTOSOMAL_LOCI = ["B", "K", "A", "E", "R", "S"] as const;
const PEDIGREE = { collie: { id: "collie", sire: null, dam: null }, dogo: { id: "dogo", sire: null, dam: null } };
const ctx = { pack: CANINE_PACK, pedigree: PEDIGREE };

/** Tally de frequência do fenótipo resolvido em cada loco, sobre N cruzamentos. */
function sampleLocusDistributions(sire: ParentInput, dam: ParentInput, seedPrefix: string): Record<string, Map<string, number>> {
  const tallies: Record<string, Map<string, number>> = {};
  for (const locus of AUTOSOMAL_LOCI) tallies[locus] = new Map();
  for (let i = 0; i < N; i++) {
    const r = cross(sire, dam, "F1", `${seedPrefix}-${i}`, ctx);
    for (const locus of AUTOSOMAL_LOCI) {
      const label = r.specimen.phenotype.loci[locus] ?? "?";
      const m = tallies[locus]!;
      m.set(label, (m.get(label) ?? 0) + 1);
    }
  }
  return tallies;
}

describe("Reciprocidade — sexo não pode enviesar loci autossômicos", () => {
  it(`"collie" M × "dogo" F vs "dogo" M × "collie" F: distribuições idênticas em N=${N} (erro amostral)`, () => {
    // "collie"/"dogo" são só rótulos pro teste — genótipos reais dos fixtures
    // caninos (BOERBOEL × BRACO_ALEMAO), que já diferem em B/K/A/E/R/S.
    const collie: Omit<ParentInput, "sex"> = { id: "collie", genotype: BOERBOEL, generation: 0, species: "canis-familiaris" };
    const dogo: Omit<ParentInput, "sex"> = { id: "dogo", genotype: BRACO_ALEMAO, generation: 0, species: "canis-familiaris" };

    const orientation1 = sampleLocusDistributions({ ...collie, sex: "M" }, { ...dogo, sex: "F" }, "rec-1");
    const orientation2 = sampleLocusDistributions({ ...dogo, sex: "M" }, { ...collie, sex: "F" }, "rec-2");

    // Tolerância generosa (3 pontos percentuais) p/ ruído binomial em N=10.000
    // (desvio-padrão máx. ≈0.5pp em p=0.5) sem flakiness.
    const TOLERANCE = 0.03;
    for (const locus of AUTOSOMAL_LOCI) {
      const labels = new Set([...orientation1[locus]!.keys(), ...orientation2[locus]!.keys()]);
      for (const label of labels) {
        const p1 = (orientation1[locus]!.get(label) ?? 0) / N;
        const p2 = (orientation2[locus]!.get(label) ?? 0) / N;
        expect(Math.abs(p1 - p2), `loco ${locus}, fenótipo "${label}": ${p1} vs ${p2} (reciprocidade quebrada)`).toBeLessThan(TOLERANCE);
      }
    }
  });
});
