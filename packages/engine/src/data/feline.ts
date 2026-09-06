/**
 * Data pack FELINO — genética real de felídeos (docs/gene-bank/felinos-genetica.md,
 * ADR-0010). Loci: A (melanismo, Gene-Bank original), P (padrão/Taqpep),
 * B (TYRP1), C (série albino/TYR), D (diluição/MLPH), W (branco dominante/KIT),
 * S (manchas brancas/KIT). Compatível com o arco Pumajaguar (que usa só A).
 */
import { DEFAULT_MUTATION_RATE } from "@genbreedai/shared";
import type { SpeciesPack } from "../types";
const µ = DEFAULT_MUTATION_RATE;

export const FELINE_PACK: SpeciesPack = {
  id: "pack-feline-v2", slug: "felino-base", archetype: "FELINO",
  loci: {
    // Melanismo (Gene-Bank original) — A dominante escurece; padrão vira ghost.
    A: { name: "A", alleles: ["A", "a"], dominance: "COMPLETE", dominanceRank: ["A", "a"],
      phenotypeByAllele: { A: "melanístico", a: "não-melanístico" }, mutationRate: µ },
    // Padrão (Taqpep): rosetas > mackerel(listras) > pintas > ticked(uniforme).
    P: { name: "P", alleles: ["P^r", "P^m", "P^s", "P^t"], dominance: "COMPLETE", dominanceRank: ["P^r", "P^m", "P^s", "P^t"],
      phenotypeByAllele: { "P^r": "rosetas", "P^m": "listras", "P^s": "pintas", "P^t": "uniforme" }, mutationRate: µ },
    // Cor da eumelanina (TYRP1): preto > chocolate > canela.
    B: { name: "B", alleles: ["B", "b", "b^l"], dominance: "COMPLETE", dominanceRank: ["B", "b", "b^l"],
      phenotypeByAllele: { B: "preto", b: "chocolate", "b^l": "canela" }, mutationRate: µ },
    // Série albino (TYR): pleno > sépia > pontos(siamês) > albino-azul > albino-vermelho.
    C: { name: "C", alleles: ["C", "c^b", "c^s", "c^a", "c"], dominance: "COMPLETE", dominanceRank: ["C", "c^b", "c^s", "c^a", "c"],
      phenotypeByAllele: { C: "pleno", "c^b": "sépia", "c^s": "pontos", "c^a": "albino", c: "albino" }, mutationRate: µ },
    // Diluição (MLPH): denso > diluído.
    D: { name: "D", alleles: ["D", "d"], dominance: "COMPLETE", dominanceRank: ["D", "d"],
      phenotypeByAllele: { D: "denso", d: "diluído" }, mutationRate: µ },
    // Branco dominante (KIT): mascara tudo.
    W: { name: "W", alleles: ["W", "w"], dominance: "COMPLETE", dominanceRank: ["W", "w"],
      phenotypeByAllele: { W: "branco", w: "colorido" }, mutationRate: µ },
    // Manchas brancas (KIT): bicolor.
    S: { name: "S", alleles: ["S", "s"], dominance: "COMPLETE", dominanceRank: ["S", "s"],
      phenotypeByAllele: { S: "bicolor", s: "sólido" }, mutationRate: µ },
  },
  epistasis: [
    // Branco dominante mascara cor e padrão.
    { modifierLocus: "W", whenAllelePresent: "W", targetLocus: "P", override: "branco", label: "branco-dominante" },
    { modifierLocus: "W", whenAllelePresent: "W", targetLocus: "B", override: "branco", label: "branco-dominante-cor" },
  ],
  lethals: [],
  quantitative: { porte: { mean: 0.5, h2: 0.5 }, vigor: { mean: 0.5, h2: 0.35 }, beleza: { mean: 0.5, h2: 0.25 }, rosetas: { mean: 0.5, h2: 0.6 } },
};
