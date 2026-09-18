/**
 * Fetch do lado do SERVIDOR (Server Components/`generateMetadata`) — só pra
 * rotas PÚBLICAS da API (sem cabeçalho de auth nenhum; nunca usar isto pra
 * rota que exige login). `lib/api.ts` (fetch do BROWSER) não serve aqui:
 * usa caminho relativo (`/api/v1/...`, resolvido pelo proxy do Next,
 * `next.config.mjs`) e `demoHeaders()`/`localStorage`, que não existem
 * durante SSR — o servidor Next precisa de uma URL ABSOLUTA pra API.
 *
 * Mesma resolução de origem que `next.config.mjs` usa pro proxy — duplicada
 * aqui de propósito (`next.config.mjs` não é importável em runtime por
 * código de app); se um mudar, o outro precisa mudar junto.
 */
import type { Sex } from "@genbreedai/shared";

function apiBaseUrl(): string {
  return (
    process.env.API_URL ??
    (process.env.NODE_ENV === "production"
      ? "https://genbreedaiapi-production.up.railway.app"
      : "http://localhost:3001")
  );
}

/** Projeção pública de um espécime (GET /api/v1/public/specimens/:id, sem login) — ver `public-specimen.controller.ts`. */
export interface PublicSpecimen {
  id: string;
  displayName: string;
  species: string;
  aura: number;
  sex: Sex | null;
  generation: number;
  imageUrl: string | null;
}

/** `null` quando o espécime não existe (404) — nunca lança pra esse caso; outros erros HTTP lançam. */
export async function getPublicSpecimen(id: string): Promise<PublicSpecimen | null> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/public/specimens/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao carregar espécime (${res.status}).`);
  return res.json();
}
