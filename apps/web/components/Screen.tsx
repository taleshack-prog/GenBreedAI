import type { ReactNode } from "react";

/** Moldura de tela (header HUD + área de conteúdo + espaço p/ bottom nav). */
export function Screen({
  title, subtitle, right, children,
}: {
  title: string; subtitle?: string; right?: ReactNode; children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-5">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-black uppercase tracking-wider text-ink"
            style={{ textShadow: "0 0 10px rgba(0,240,255,0.35)" }}>{title}</h1>
          {subtitle && <p className="text-[0.7rem] uppercase tracking-widest text-ink-muted">{subtitle}</p>}
        </div>
        {right}
      </header>
      <div className="gel-rule mb-5" />
      {children}
    </main>
  );
}

/** Chip de moeda (Biomassa / Catalisadores). */
export function CurrencyChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-bg-800 px-3 py-1.5" style={{ borderColor: `${color}4D` }}>
      <span style={{ color }}>⬢</span>
      <div className="leading-none">
        <div className="text-[0.6rem] uppercase text-ink-muted">{label}</div>
        <div className="font-mono text-sm text-ink">{value}</div>
      </div>
    </div>
  );
}

/** Cartão-placeholder para telas em construção (mantém a estética). */
export function ComingSoon({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-cyan/20 bg-bg-800/60 p-8 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00F0FF" strokeWidth="1.4"
        className="mx-auto mb-3 opacity-60"><path d="M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 6h10M7 18h10" /></svg>
      <div className="text-sm text-ink-muted">{children}</div>
    </div>
  );
}
