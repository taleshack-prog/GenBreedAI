/**
 * Rotas PÚBLICAS indexáveis (sitemap.xml) — fonte única de `app/sitemap.ts` e do teste.
 * Só páginas de conteúdo estável, sem login. FORA de propósito:
 *  - `/app/*` — área logada (o middleware redireciona para /login; robots.txt também bloqueia);
 *  - `/f/[id]` — página de compartilhamento de UM espécime (não se indexa em massa);
 *  - `/login` e `/signup` — sem conteúdo próprio (formulários).
 * Rota pública nova de conteúdo entra aqui; o teste confere que cada uma tem `app/<rota>/page.tsx`.
 */
import { PUBLIC_SHARE_ORIGIN } from "./share";

export const PUBLIC_ROUTES = ["/", "/o-que-e", "/professores", "/termos", "/privacidade", "/reembolso"] as const;
export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

/**
 * `lastmod` do sitemap: dia (AAAA-MM-DD) da última mudança de CONTEÚDO de cada rota. Não é a data do build — carimbar o
 * dia do deploy em toda URL faz o Google passar a ignorar o campo. Mexeu na página (ou nos arquivos de `ROUTE_SOURCES`)?
 * Atualize a data aqui: o teste compara com o histórico do git e falha se ela ficar para trás.
 */
export const ROUTE_LASTMOD: Record<PublicRoute, string> = {
  "/": "2026-11-26",
  "/o-que-e": "2026-11-26",
  "/professores": "2026-11-26",
  "/termos": "2026-09-14",
  "/privacidade": "2026-11-26",
  "/reembolso": "2026-11-26",
};

/** Arquivos (relativos a `apps/web/`) cujo conteúdo aparece em cada rota — o que o teste confere no git. */
export const ROUTE_SOURCES: Record<PublicRoute, readonly string[]> = {
  "/": ["app/page.tsx", "components/LandingPage.tsx", "lib/about.ts", "lib/plans.ts", "components/PlanPicker.tsx"],
  "/o-que-e": ["app/o-que-e/page.tsx", "lib/about.ts", "lib/plans.ts", "lib/gestation.ts", "../../packages/shared/src/breeds.ts", "../../packages/shared/src/species.ts"],
  "/professores": ["app/professores/page.tsx", "lib/teachers.ts", "lib/gestation.ts"],
  "/termos": ["app/termos/page.tsx"],
  "/privacidade": ["app/privacidade/page.tsx"],
  "/reembolso": ["app/reembolso/page.tsx"],
};

/** Prefixos que NUNCA podem aparecer no sitemap nem ficar abertos no robots. */
export const NON_INDEXABLE_PREFIXES = ["/app", "/f/"] as const;

export const SITE_ORIGIN = PUBLIC_SHARE_ORIGIN;

export function publicUrl(path: string): string {
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}
