/** Nome de exibição: raça (Felis catus) via BREEDS; senão nome da espécie. */
import { speciesInfo, breedInfo, dogBreedInfo } from "@genbreedai/shared";
import type { ApiSpecimen } from "./api";

export function displayName(s: Pick<ApiSpecimen, "id" | "species">): string {
  return breedInfo(s.id)?.name ?? dogBreedInfo(s.id)?.name ?? speciesInfo(s.species).common;
}
export function displaySci(s: Pick<ApiSpecimen, "id" | "species">): string {
  if (breedInfo(s.id)) return "Felis catus";
  if (dogBreedInfo(s.id)) return "Canis familiaris";
  return speciesInfo(s.species).scientific;
}
