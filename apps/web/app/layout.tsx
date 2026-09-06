import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GenBreedAI · Laboratório",
  description: "Cruze espécies, preveja a herança mendeliana e fixe fenótipos.",
  manifest: "/manifest.webmanifest",
  applicationName: "GenBreedAI",
  appleWebApp: { capable: true, title: "GenBreedAI", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#050A0F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
