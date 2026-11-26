import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, ROUTE_LASTMOD, publicUrl } from "../lib/public-routes";

/** `/sitemap.xml` (recurso nativo do Next 15). Só as rotas públicas de `lib/public-routes.ts` — nunca `/app/*` nem `/f/[id]`; `lastmod` real por rota (`ROUTE_LASTMOD`). */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({ url: publicUrl(path), lastModified: ROUTE_LASTMOD[path] }));
}
