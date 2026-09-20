import type { Metadata } from "next";
import { BottomNav } from "../../components/BottomNav";
import { SubscriptionBanner } from "../../components/SubscriptionBanner";

export const metadata: Metadata = {
  title: "GenBreedAI · Laboratório",
  description: "Cruze espécies, preveja a herança mendeliana e fixe fenótipos.",
};

/**
 * Só as telas do jogo (/app/*) ganham a bottom nav — a landing e as páginas legais não. A faixa de aviso de assinatura
 * (ADR-0030) também mora aqui: aparece ao abrir qualquer tela do jogo.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <><SubscriptionBanner />{children}<BottomNav /></>;
}
