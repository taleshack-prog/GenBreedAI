import type { Metadata } from "next";
import { BottomNav } from "../../components/BottomNav";

export const metadata: Metadata = {
  title: "GenBreedAI · Laboratório",
  description: "Cruze espécies, preveja a herança mendeliana e fixe fenótipos.",
};

/** Só as telas do jogo (/app/*) ganham a bottom nav — a landing e as páginas legais não. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<BottomNav /></>;
}
