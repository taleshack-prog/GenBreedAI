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
    // Juba (poligênico simplificado, dominância INCOMPLETA): Ma/Ma completa, Ma/ma parcial (lígre), ma/ma sem juba.
    Ma: { name: "Ma", alleles: ["Ma", "ma"], dominance: "INCOMPLETE", dominanceRank: ["Ma", "ma"],
      phenotypeByAllele: { Ma: "juba completa", ma: "sem juba" }, heteroPhenotype: { "Ma|ma": "juba parcial" }, mutationRate: µ },
    // Comprimento do pelo (FGF5): longo dominante sobre curto.
    Fl: { name: "Fl", alleles: ["Fl^l", "Fl^s"], dominance: "COMPLETE", dominanceRank: ["Fl^l", "Fl^s"],
      phenotypeByAllele: { "Fl^l": "pelo longo", "Fl^s": "pelo curto" }, mutationRate: µ },
    // Ausência de pelo (Sphynx, KRT71): Hr normal dominante > hr pelado (recessivo).
    Hr: { name: "Hr", alleles: ["Hr", "hr"], dominance: "COMPLETE", dominanceRank: ["Hr", "hr"],
      phenotypeByAllele: { Hr: "com pelo", hr: "pelado (sphynx)" }, mutationRate: µ },
    // Cor de fundo da pelagem.
    Bd: { name: "Bd", alleles: ["Bd^a", "Bd^d", "Bd^s", "Bd^g"], dominance: "COMPLETE", dominanceRank: ["Bd^a", "Bd^d", "Bd^s", "Bd^g"],
      phenotypeByAllele: { "Bd^a": "fundo âmbar", "Bd^d": "fundo dourado", "Bd^s": "fundo areia", "Bd^g": "fundo cinza" }, mutationRate: µ },
    // Formato da cabeça (dominância incompleta → intermediário em híbridos).
    He: { name: "He", alleles: ["He^b", "He^a", "He^r"], dominance: "INCOMPLETE", dominanceRank: ["He^b", "He^a", "He^r"],
      phenotypeByAllele: { "He^b": "cabeça larga", "He^a": "cabeça angular", "He^r": "cabeça arredondada" },
      heteroPhenotype: { "He^b|He^r": "cabeça média", "He^b|He^a": "cabeça larga-angular", "He^a|He^r": "cabeça angular-suave" }, mutationRate: µ },
    // Orelhas.
    Ec: { name: "Ec", alleles: ["Ec^t", "Ec^l", "Ec^n"], dominance: "COMPLETE", dominanceRank: ["Ec^t", "Ec^l", "Ec^n"],
      phenotypeByAllele: { "Ec^t": "orelhas tufadas (lince)", "Ec^l": "orelhas grandes (serval)", "Ec^n": "orelhas normais" }, mutationRate: µ },
  },
  epistasis: [
    // Branco dominante mascara cor e padrão.
    { modifierLocus: "W", whenAllelePresent: "W", targetLocus: "P", override: "branco", label: "branco-dominante" },
    { modifierLocus: "W", whenAllelePresent: "W", targetLocus: "B", override: "branco", label: "branco-dominante-cor" },
  ],
  lethals: [],
  quantitative: { porte: { mean: 0.5, h2: 0.5 }, vigor: { mean: 0.5, h2: 0.35 }, beleza: { mean: 0.5, h2: 0.25 }, rosetas: { mean: 0.5, h2: 0.6 } },
};
