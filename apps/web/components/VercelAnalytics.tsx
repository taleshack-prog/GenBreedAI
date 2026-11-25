"use client";

import { Analytics } from "@vercel/analytics/next";
import { limparUrlAnalytics } from "../lib/analytics";

/** Pageviews do Vercel Web Analytics (sem cookies), com a URL limpa antes do envio. */
export function VercelAnalytics() {
  return <Analytics beforeSend={limparUrlAnalytics} />;
}
