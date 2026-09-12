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
    // Diluição (MLPH): denso dominante > diluído (azul/isabela).
    D: { name: "D", alleles: ["D", "d"], dominance: "COMPLETE", dominanceRank: ["D", "d"],
      phenotypeByAllele: { D: "denso", d: "diluído (azul)" }, mutationRate: µ },
    // ── Morfológicos (ADR-0011) ──
    // Crânio (dom. incompleta → focinho intermediário em cruzas).
    Cph: { name: "Cph", alleles: ["Cph^b", "Cph^m", "Cph^d"], dominance: "INCOMPLETE", dominanceRank: ["Cph^b", "Cph^m", "Cph^d"],
      phenotypeByAllele: { "Cph^b": "focinho curto (braquicefálico)", "Cph^m": "focinho médio", "Cph^d": "focinho longo (dolicocefálico)" },
      heteroPhenotype: { "Cph^b|Cph^d": "focinho médio", "Cph^b|Cph^m": "focinho curto-médio", "Cph^m|Cph^d": "focinho médio-longo" }, mutationRate: µ },
    // Orelhas (dom. incompleta → semieretas em cruzas de eretas × caídas).
    Ec: { name: "Ec", alleles: ["Ec^e", "Ec^s", "Ec^d"], dominance: "INCOMPLETE", dominanceRank: ["Ec^e", "Ec^s", "Ec^d"],
      phenotypeByAllele: { "Ec^e": "orelhas eretas", "Ec^s": "orelhas semieretas", "Ec^d": "orelhas caídas" },
      heteroPhenotype: { "Ec^e|Ec^d": "orelhas semieretas", "Ec^e|Ec^s": "orelhas eretas", "Ec^s|Ec^d": "orelhas semicaídas" }, mutationRate: µ },
    // Comprimento do pelo.
    Cl: { name: "Cl", alleles: ["Cl^l", "Cl^s"], dominance: "COMPLETE", dominanceRank: ["Cl^l", "Cl^s"],
      phenotypeByAllele: { "Cl^l": "pelo longo", "Cl^s": "pelo curto" }, mutationRate: µ },
    // Tipo do pelo.
    Ct: { name: "Ct", alleles: ["Ct^w", "Ct^c", "Ct^n"], dominance: "COMPLETE", dominanceRank: ["Ct^w", "Ct^c", "Ct^n"],
      phenotypeByAllele: { "Ct^w": "pelo áspero", "Ct^c": "pelo cacheado", "Ct^n": "pelo liso" }, mutationRate: µ },
    // Cauda.
    Tl: { name: "Tl", alleles: ["Tl^l", "Tl^c", "Tl^b"], dominance: "COMPLETE", dominanceRank: ["Tl^l", "Tl^c", "Tl^b"],
      phenotypeByAllele: { "Tl^l": "cauda longa", "Tl^c": "cauda enrolada", "Tl^b": "cauda curta" }, mutationRate: µ },
  },
  epistasis: [{ modifierLocus: "H", whenAllelePresent: "H", targetLocus: "M", targetWhenAllelePresent: "M",
    override: "arlequim (fundo branco, manchas)", label: "harlequin-sobre-merle" }],
  lethals: [{ locus: "M", genotype: ["M", "M"], label: "duplo-merle-letal" }],
  quantitative: { porte: { mean: 0.5, h2: 0.5 }, vigor: { mean: 0.5, h2: 0.35 }, beleza: { mean: 0.5, h2: 0.25 }, temperamento: { mean: 0.5, h2: 0.3 } },
};
