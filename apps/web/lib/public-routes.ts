/**
 * Rotas PÚBLICAS indexáveis (sitemap.xml) — fonte única de `app/sitemap.ts` e do teste.
 * Só páginas de conteúdo estável, sem login. FORA de propósito:
 *  - `/app/*` — área logada (o middleware redireciona para /login; robots.txt também bloqueia);
 *  - `/f/[id]` — página de compartilhamento de UM espécime (não se indexa em massa);
 *  - `/login` e `/signup` — sem conteúdo próprio (formulários).
 * Rota pública nova de conteúdo entra aqui; o teste confere que cada uma tem `app/<rota>/page.tsx`.
 */
import { PUBLIC_SHARE_ORIGIN } from "./share";

export const PUBLIC_ROUTES = ["/", "/o-que-e", "/termos", "/privacidade", "/reembolso"] as const;

/** Prefixos que NUNCA podem aparecer no sitemap nem ficar abertos no robots. */
export const NON_INDEXABLE_PREFIXES = ["/app", "/f/"] as const;

export const SITE_ORIGIN = PUBLIC_SHARE_ORIGIN;

export function publicUrl(path: string): string {
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}
