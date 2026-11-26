/**
 * `/` — landing. Rota de SERVIDOR só para exportar `metadata` e o JSON-LD (um arquivo "use client" não exporta metadata);
 * o conteúdo é `components/LandingPage.tsx`. Title, description e JSON-LD vêm de `lib/about.ts` (fonte única, testada).
 */
import type { Metadata } from "next";
import { LandingPage } from "../components/LandingPage";
import { ABOUT_OG_IMAGE, HOME_DESCRIPTION, HOME_TITLE, HOME_URL, buildHomeJsonLd, serializeJsonLd } from "../lib/about";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: { canonical: HOME_URL },
  openGraph: {
    type: "website",
    url: HOME_URL,
    siteName: "GenBreedAI",
    locale: "pt_BR",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [{ url: ABOUT_OG_IMAGE, alt: "Híbrido de Leopardo-das-neves × Tigre-albino gerado no GenBreedAI", type: "image/jpeg" }],
  },
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: HOME_DESCRIPTION, images: [ABOUT_OG_IMAGE] },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildHomeJsonLd()) }} />
      <LandingPage />
    </>
  );
}
