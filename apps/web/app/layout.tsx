import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RefCapture } from "../components/RefCapture";
import { ServiceWorkerRegister } from "../components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "GenBreedAI",
  description: "Cruze espécies, estude a herança mendeliana e quantitativa real, e tente fixar fenótipos ao longo de gerações.",
  manifest: "/manifest.webmanifest",
  applicationName: "GenBreedAI",
  // iPhone (app instalado pelo Safari): capable + título + barra de status. "black" (opaca) e não
  // "black-translucent": a translúcida faz o conteúdo passar POR BAIXO da barra e o app não trata safe-area.
  appleWebApp: { capable: true, title: "GenBreedAI", statusBarStyle: "black" },
  icons: {
    icon: "/icon.svg",
    // PENDENTE (ícone PNG 180×180 ainda não existe em public/ — o iOS ignora SVG). Quando `public/apple-touch-icon.png`
    // existir, descomente a linha abaixo; não referenciar arquivo inexistente.
    // apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#070b11", // = fundo do body (globals.css) e do manifest
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <RefCapture />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
