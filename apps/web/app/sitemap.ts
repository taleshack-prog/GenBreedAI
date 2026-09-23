import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, publicUrl } from "../lib/public-routes";

/** `/sitemap.xml` (recurso nativo do Next 15). Só as rotas públicas de `lib/public-routes.ts` — nunca `/app/*` nem `/f/[id]`. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({ url: publicUrl(path) }));
}
