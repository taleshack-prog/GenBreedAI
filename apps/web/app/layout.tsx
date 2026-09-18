import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RefCapture } from "../components/RefCapture";

export const metadata: Metadata = {
  title: "GenBreedAI",
  description: "Cruze espécies, estude a herança mendeliana e quantitativa real, e tente fixar fenótipos ao longo de gerações.",
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
      <body>
        <RefCapture />
        {children}
      </body>
    </html>
  );
}
