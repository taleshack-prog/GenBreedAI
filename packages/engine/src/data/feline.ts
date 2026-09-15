/**
 * Data pack FELINO — genética real de felídeos (docs/gene-bank/felinos-genetica.md,
 * ADR-0010). Loci: A (melanismo, Gene-Bank original), P (padrão/Taqpep),
 * B (TYRP1), C (série albino/TYR), D (diluição/MLPH), W (branco dominante/KIT),
 * S (manchas brancas/KIT). Compatível com o arco Pumajaguar (que usa só A).
 *
 * xLoci: O (laranja, ligado ao X — ADR-0013, gene-bank §"Locus ligado ao X").
 * Mutação O só é modelada em Felis catus (Etapa 5/dados); felinos selvagens
 * ficam fixados em `o` — A, P e Bd continuam intocados por esta extensão.
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
  xLoci: {
    // Laranja (ADR-0013) — mascara a via de A (eumelanina→feomelanina), NÃO
    // mascara P. Fêmea O/o = mosaico (inativação do X), não dominância.
    O: { name: "O", alleles: ["O", "o"], dominance: "CODOMINANT", dominanceRank: ["O", "o"],
      phenotypeByAllele: { O: "laranja", o: "não-laranja" }, heteroPhenotype: { "O|o": "mosaico" }, mutationRate: µ },
  },
  epistasis: [
    // Branco dominante mascara cor e padrão.
    { modifierLocus: "W", whenAllelePresent: "W", targetLocus: "P", override: "branco", label: "branco-dominante" },
    { modifierLocus: "W", whenAllelePresent: "W", targetLocus: "B", override: "branco", label: "branco-dominante-cor" },
  ],
  // Interação tipada (ADR-0013): O decide a via de pigmento; P continua
  // definindo o padrão. Formato PRÓPRIO — não reaproveita/altera `epistasis`.
  interactionRules: [
    {
      kind: "pigmentOverride", xLocus: "O", activeAllele: "O",
      dilutionLocus: "D", dilutedAllele: "d",
      patternLocus: "P", uniformPatternAllele: "P^t",
      label: "laranja-ligado-ao-x",
    },
  ],
  lethals: [],
  quantitative: { porte: { mean: 0.5, h2: 0.5 }, vigor: { mean: 0.5, h2: 0.35 }, beleza: { mean: 0.5, h2: 0.25 }, rosetas: { mean: 0.5, h2: 0.6 } },
  // Efeito materno no porte (ADR-0014 — Walton & Hammond 1938). Mesmo valor
  // em FELINE e CANINE nesta versão — PARÂMETRO DO JOGO, Tales define.
  maternalEffect: { porte: { mBirth: 0.75, mBirthRange: [0.67, 1.0], mAdult: 0.25 } },
  // Taxonomia (ADR-0015, Etapa 2c, item 2) — ESPELHA packages/shared/src/
  // species.ts (SPECIES_INFO.genus); duplicado aqui de propósito (motor não
  // importa dados de negócio de @genbreedai/shared). Morfos de cor do tigre
  // (branco/albino) usam biologicalSpecies="panthera-tigris" — não entram
  // aqui como chave própria, ver item 1.
  speciesGenus: {
    "panthera-onca": "Panthera",
    "panthera-leo": "Panthera",
    "panthera-tigris": "Panthera",
    "panthera-pardus": "Panthera",
    "panthera-uncia": "Panthera",
    puma: "Puma",
    "acinonyx-jubatus": "Acinonyx",
    "leptailurus-serval": "Leptailurus",
    "leopardus-pardalis": "Leopardus",
    "lynx-lynx": "Lynx",
    caracal: "Caracal",
    "felis-catus": "Felis",
  },
  // NÃO adicionar gênero/par sem ADR (item 2, Etapa 2c).
  hybridGenusWhitelist: ["Panthera"],
  hybridSpeciesWhitelist: [
    {
      speciesA: "felis-catus", speciesB: "leptailurus-serval",
      source: "Gato Savannah (Felis catus × Leptailurus serval) — híbrido F1 real e documentado; fêmeas F1 férteis, machos estéreis até gerações avançadas (~F4/F5).",
    },
  ],
};
