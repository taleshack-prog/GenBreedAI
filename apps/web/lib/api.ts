/**
 * Cliente da API GenBreedAI. O browser chama /api/v1/* (mesma origem) e o Next
 * repassa à API NestJS (ver next.config rewrites), evitando CORS.
 *
 * Autenticação (dev): cabeçalhos x-user-id / x-user-tier — mesma convenção do
 * AuthGuard da API. Na Fase 1c isto vira sessão Auth.js.
 */

import type { Genotype } from "@genbreedai/shared";

export type PackId = "canine" | "feline";

export interface ApiSpecimen {
  id: string;
  ownerId: string;
  pack: PackId;
  species: string;
  genotype: Genotype;
  generation: number;
  sireId: string | null;
  damId: string | null;
  method: string;
  fPedigree: number;
  fixationIndex: number;
  aura: number;
  cacheKey: string | null;
}

export interface CrossResponse {
  specimen: ApiSpecimen;
  cacheKey: string;
  engine: {
    genotype: Genotype;
    phenotype: {
      loci: Record<string, string>;
      qtl: Record<string, number>;
      viable: boolean;
      epistasis: string[];
      hasMutation: boolean;
    };
    fPedigree: number;
    fertility: { score: number; inviabilityRisk: number; haldaneSterile: boolean; notes: string[] };
    fixationIndex: number;
    aura: number;
    generation: number;
    method: string;
  };
}

// Usuário-demo do scaffold (dono dos fundadores semeados na API).
const DEMO_HEADERS = { "x-user-id": "demo", "x-user-tier": "PHD", "content-type": "application/json" };

export async function listSpecimens(): Promise<ApiSpecimen[]> {
  const res = await fetch("/api/v1/specimens", { headers: DEMO_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao listar espécimes (${res.status}).`);
  return res.json();
}

export async function postCross(input: {
  sireId: string;
  damId: string;
  method: string;
  seed?: string;
}): Promise<CrossResponse> {
  const res = await fetch("/api/v1/cross", {
    method: "POST",
    headers: DEMO_HEADERS,
    body: JSON.stringify(input),
  });
  if (res.status === 429) throw new Error("Cota diária de cruzamentos esgotada para este tier.");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Cruzamento falhou (${res.status}).`);
  }
  return res.json();
}
