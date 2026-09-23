import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "../lib/public-routes";

/** `/robots.txt` (recurso nativo do Next 15): libera o site, bloqueia a área logada (`/app/`) e aponta para o sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/app/" },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
