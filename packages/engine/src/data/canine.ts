/**
 * Data pack CANINO — loci/alelos derivados do Gene-Bank (TDD §4.5).
 * Modelo B/K/A/E/S/R/F/C/M/H. Nada inventado fora das tabelas do Gene-Bank.
 */
import { DEFAULT_MUTATION_RATE } from "@genbreedai/shared";
import type { SpeciesPack } from "../types";
const µ = DEFAULT_MUTATION_RATE;

export const CANINE_PACK: SpeciesPack = {
  id: "pack-canine-v1", slug: "canino-base", archetype: "CANINO",
  loci: {
    B: { name: "B", alleles: ["B", "b"], dominance: "COMPLETE", dominanceRank: ["B", "b"],
      phenotypeByAllele: { B: "preto/roan", b: "liver/chocolate" }, mutationRate: µ },
    K: { name: "K", alleles: ["K^br", "k^y"], dominance: "COMPLETE", dominanceRank: ["K^br", "k^y"],
      phenotypeByAllele: { "K^br": "brindle/tigrado", "k^y": "permite-agouti" }, mutationRate: µ },
    A: { name: "A", alleles: ["A^y", "a^t", "a"], dominance: "COMPLETE", dominanceRank: ["A^y", "a^t", "a"],
      phenotypeByAllele: { "A^y": "fulvo/sable", "a^t": "tan-points", a: "não-agouti" }, mutationRate: µ },
    E: { name: "E", alleles: ["E", "e"], dominance: "COMPLETE", dominanceRank: ["E", "e"],
      phenotypeByAllele: { E: "extensão-normal", e: "creme/vermelho" }, mutationRate: µ },
    S: { name: "S", alleles: ["S", "s^p"], dominance: "COMPLETE", dominanceRank: ["S", "s^p"],
      phenotypeByAllele: { S: "sólido", "s^p": "piebald" }, mutationRate: µ },
    R: { name: "R", alleles: ["R", "r"], dominance: "COMPLETE", dominanceRank: ["R", "r"],
      phenotypeByAllele: { R: "roan", r: "sem-roan" }, mutationRate: µ },
    F: { name: "F", alleles: ["F", "f"], dominance: "INCOMPLETE", dominanceRank: ["F", "f"],
      phenotypeByAllele: { F: "cacheado", f: "liso" }, heteroPhenotype: { "F|f": "ondulado" }, mutationRate: µ },
    C: { name: "C", alleles: ["C", "c^ch"], dominance: "INCOMPLETE", dominanceRank: ["C", "c^ch"],
      phenotypeByAllele: { C: "pigmento-pleno", "c^ch": "creme" }, heteroPhenotype: { "C|c^ch": "creme-parcial" }, mutationRate: µ },
    M: { name: "M", alleles: ["M", "m"], dominance: "INCOMPLETE", dominanceRank: ["M", "m"],
      phenotypeByAllele: { M: "merle-duplo", m: "não-merle" }, heteroPhenotype: { "M|m": "merle" }, mutationRate: µ },
    H: { name: "H", alleles: ["H", "h"], dominance: "COMPLETE", dominanceRank: ["H", "h"],
      phenotypeByAllele: { H: "portador-harlequin", h: "sem-harlequin" }, mutationRate: µ },
  },
  epistasis: [{ modifierLocus: "H", whenAllelePresent: "H", targetLocus: "M", targetWhenAllelePresent: "M",
    override: "arlequim (fundo branco, manchas)", label: "harlequin-sobre-merle" }],
  lethals: [{ locus: "M", genotype: ["M", "M"], label: "duplo-merle-letal" }],
  quantitative: { porte: { mean: 0.5, h2: 0.5 }, vigor: { mean: 0.5, h2: 0.35 }, beleza: { mean: 0.5, h2: 0.25 }, temperamento: { mean: 0.5, h2: 0.3 } },
};
