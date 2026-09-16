/**
 * Nome de exibição / nome científico de um espécime — FONTE ÚNICA (a web usa
 * exatamente isto, via apps/web/lib/display.ts; nenhum outro lugar deve
 * reimplementar esta cadeia). Ordem de resolução do nome de exibição:
 *   1. raça de gato (BREEDS, por id de fundador) — "Felis catus" sempre.
 *   2. raça de cão (DOG_BREEDS, por id de fundador) — "Canis familiaris" sempre.
 *   3. fundador de felino SELVAGEM (WILD_FELINE_FOUNDER_NAMES, por id).
 *   4. nome comum/científico da ESPÉCIE (speciesInfo), por último.
 *
 * Gêmeos de fundador (ids terminados em "-femea"/"-macho" — ver founderSeeds()
 * em apps/api/src/specimens/in-memory.repository.ts) usam o MESMO nome do
 * fundador base: o sufixo é removido ANTES de consultar qualquer tabela
 * (`baseFounderId`), senão "gato-persa-femea"/"onca-negra-macho" etc. não
 * batem em nenhuma tabela e caem no nome genérico da espécie.
 */
import { breedInfo, dogBreedInfo } from "./breeds";
import { speciesInfo, normalizeBiologicalSpecies } from "./species";

/**
 * Nomes de exibição dos fundadores de felinos SELVAGENS (fora de Felis catus
 * — sem raça própria em BREEDS), por id BASE de fundador (sem sufixo de
 * gêmeo). Cobre TODOS os felinos selvagens de founderSeeds() (apps/api/src/
 * specimens/in-memory.repository.ts) — não inventa fundador que não exista
 * lá. Onças e tigres têm nome próprio por indivíduo (morfo/cor); os demais
 * usam o nome comum da espécie (speciesInfo).
 */
export const WILD_FELINE_FOUNDER_NAMES: Record<string, string> = {
  "onca-pintada": "Onça-pintada",
  "onca-negra": "Onça-negra",
  "onca-pintada-2": "Onça-pintada II",
  puma: "Puma (Suçuarana)",
  leao: "Leão",
  "tigre-bengala": "Tigre-de-Bengala",
  "tigre-branco": "Tigre-branco",
  "tigre-albino": "Tigre-albino",
  leopardo: "Leopardo",
  jaguatirica: "Jaguatirica",
  guepardo: "Guepardo",
  serval: "Serval",
  "leopardo-das-neves": "Leopardo-das-neves",
  lince: "Lince",
  caracal: "Caracal",
};
export function wildFelineFounderName(id: string): string | undefined {
  return WILD_FELINE_FOUNDER_NAMES[id];
}

/** Remove o sufixo de gêmeo de fundador ("-femea"/"-macho") — id "normal" passa direto. */
export function baseFounderId(id: string): string {
  return id.replace(/-(femea|macho)$/, "");
}

export function resolveDisplayName(id: string, species: string): string {
  const base = baseFounderId(id);
  return breedInfo(base)?.name ?? dogBreedInfo(base)?.name ?? wildFelineFounderName(base) ?? speciesInfo(species).common;
}

export function resolveScientificName(id: string, species: string): string {
  const base = baseFounderId(id);
  if (breedInfo(base)) return "Felis catus";
  if (dogBreedInfo(base)) return "Canis familiaris";
  return speciesInfo(species).scientific;
}

/**
 * Palavra do título da tela de revelação (/app/reveal/[id]): "Híbrido" só
 * quando a ESPÉCIE tiver mais de um componente biológico
 * (normalizeBiologicalSpecies devolve "×") — ex.: tigre × leão. Dois
 * fundadores da MESMA espécie sem parentesco (ex.: gato × gata domésticos)
 * não são híbrido nenhum: "Filhote" (achado em produção — o título fixo
 * "Híbrido Revelado" aparecia pra qualquer cruzamento, até intraespécie).
 */
export function revealTitleWord(species: string): "Híbrido" | "Filhote" {
  return normalizeBiologicalSpecies(species).includes("×") ? "Híbrido" : "Filhote";
}
