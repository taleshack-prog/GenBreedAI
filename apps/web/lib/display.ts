/**
 * Nome de exibição / nome científico — wrapper fino sobre @genbreedai/shared
 * (fonte única, testada em apps/api/test/visibility.spec.ts; a web não tem
 * infra de teste própria). Todo lugar da web que mostra nome de espécime
 * DEVE passar por aqui — nunca reimplementar a cadeia raça → fundador
 * selvagem → espécie (ver packages/shared/src/display.ts).
 */
import { resolveDisplayName, resolveScientificName } from "@genbreedai/shared";
import type { ApiSpecimen } from "./api";

export function displayName(s: Pick<ApiSpecimen, "id" | "species">): string {
  return resolveDisplayName(s.id, s.species);
}
export function displaySci(s: Pick<ApiSpecimen, "id" | "species">): string {
  return resolveScientificName(s.id, s.species);
}
