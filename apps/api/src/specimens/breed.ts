/**
 * Raça do espécime (`specimens.breed`, ADR-0033 adendo 2) — funções PURAS.
 *
 * Toda raça de gato tem `species = "felis-catus"`, então a espécie não carrega a raça; o campo `breed` carrega:
 *  - FUNDADOR de gato de raça → o id da raça ("gato-persa"); o gêmeo herda o do base. `gato-tabby`/`gato-preto`/`gato-branco` são
 *    variedades de cor, não raças → nulo. Felinos selvagens → nulo (a espécie já os identifica).
 *  - FUNDADOR de cão → o slug da ESPÉCIE ("boerboel", "dogue-alemao"), só para ficar uniforme (o prompt canino segue por espécie).
 *  - NASCIDO → o `breed` dos pais se os DOIS forem iguais e não nulos; senão nulo (mestiço).
 * Espécime antigo (coluna criada depois) tem `breed` nulo: para FUNDADOR o valor se deriva do id, então herdar de um fundador antigo
 * funciona sem backfill; filhote antigo fica nulo (comportamento de antes).
 */
import { baseFounderId, dogBreedInfo, CAT_BREED_ENGLISH_NAMES } from "@genbreedai/shared";
import type { SpecimenRepository, StoredSpecimen } from "./in-memory.repository";

/** Raça de um FUNDADOR pelo id e espécie (twins tratados como o base). */
export function founderBreed(id: string, species: string): string | null {
  const base = baseFounderId(id);
  if (species === "felis-catus") return CAT_BREED_ENGLISH_NAMES[base] ? base : null;
  if (dogBreedInfo(base)) return species;
  return null;
}

/** `breed` gravado; se nulo e for fundador (legado sem a coluna), deriva do id. Nascido com `breed` nulo continua nulo. */
export function specimenBreed(s: Pick<StoredSpecimen, "id" | "species" | "method" | "breed">): string | null {
  if (s.breed) return s.breed;
  return s.method === "FOUNDER" ? founderBreed(s.id, s.species) : null;
}

/** Filhote herda a raça só se pai e mãe têm a MESMA raça (não nula); mestiço → `null`. */
export function inheritBreed(sireBreed: string | null | undefined, damBreed: string | null | undefined): string | null {
  return sireBreed && damBreed && sireBreed === damBreed ? sireBreed : null;
}

/** Raça do filhote a partir dos pais no repositório (pai/mãe ausente → nulo). */
export async function breedForOffspring(repo: Pick<SpecimenRepository, "get">, sireId: string, damId: string): Promise<string | null> {
  const [sire, dam] = await Promise.all([repo.get(sireId), repo.get(damId)]);
  return inheritBreed(sire ? specimenBreed(sire) : null, dam ? specimenBreed(dam) : null);
}
