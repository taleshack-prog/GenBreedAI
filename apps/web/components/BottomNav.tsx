"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Ícones line-style (Design System §5.3). */
const icons: Record<string, React.ReactNode> = {
  lab: <path d="M9 3v6l-5 9a2 2 0 002 3h12a2 2 0 002-3l-5-9V3M8 3h8M9 13h6" />,
  species: <path d="M4 5h16M4 12h16M4 19h16" />,
  crosses: <path d="M6 4v6a6 6 0 006 6 6 6 0 006-6V4M6 4h12M12 16v4" />,
  genome: <path d="M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 6h10M7 18h10" />,
  market: <path d="M4 7h16l-1.5 9.5A2 2 0 0116.5 18h-9a2 2 0 01-2-1.5L4 7zM4 7l-1-3H1M9 11v3M15 11v3" />,
  profile: <circle cx="12" cy="8" r="3.2" />,
};
const profilePath = <><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0114 0" /></>;

const TABS = [
  { href: "/", key: "lab", label: "Laboratório" },
  { href: "/species", key: "species", label: "Espécies" },
  { href: "/crosses", key: "crosses", label: "Cruzamentos" },
  { href: "/gene-bank", key: "genome", label: "Gene Bank" },
  { href: "/market", key: "market", label: "Mercado" },
  { href: "/profile", key: "profile", label: "Perfil" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan/15 bg-bg-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2 py-2">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          const color = active ? "#00F0FF" : "#9E9E9E";
          return (
            <Link key={t.href} href={t.href} className="flex flex-1 flex-col items-center gap-1 py-1">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ filter: active ? "drop-shadow(0 0 6px #00F0FF)" : undefined }}>
                {t.key === "profile" ? profilePath : icons[t.key]}
              </svg>
              <span className="font-display text-[0.55rem] uppercase tracking-wide" style={{ color }}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
