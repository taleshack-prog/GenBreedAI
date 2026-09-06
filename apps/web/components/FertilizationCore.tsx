import { DnaHelix } from "./DnaHelix";

/**
 * Núcleo de fertilização (mockup Image 2): cápsula central com embrião,
 * hélices ciano/púrpura nas laterais e a compatibilidade genética abaixo.
 */
export function FertilizationCore({ compatibility }: { compatibility: number | null }) {
  const label =
    compatibility === null ? "" : compatibility >= 70 ? "Boa compatibilidade" : compatibility >= 40 ? "Compatibilidade média" : "Baixa compatibilidade";
  return (
    <div className="flex flex-col items-center">
      <div className="font-display text-xs font-bold uppercase tracking-widest text-ok">Fertilização</div>

      <div className="mt-3 flex items-center gap-1">
        <div className="opacity-80"><DnaHelix height={120} /></div>

        {/* Cápsula */}
        <svg viewBox="0 0 90 150" width={90} height={150} aria-hidden>
          <defs>
            <linearGradient id="cap-glass" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0b1420" />
              <stop offset="50%" stopColor="#12233a" />
              <stop offset="100%" stopColor="#0b1420" />
            </linearGradient>
            <radialGradient id="embryo" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#7dffcf" />
              <stop offset="70%" stopColor="#00FF9D" />
              <stop offset="100%" stopColor="#00806a" />
            </radialGradient>
          </defs>
          <rect x="18" y="6" width="54" height="14" rx="4" fill="#0e1a2b" stroke="#1d3350" />
          <rect x="20" y="20" width="50" height="110" rx="10" fill="url(#cap-glass)" stroke="#1d3350" />
          <rect x="24" y="24" width="42" height="102" rx="8" className="cryo-liquid" opacity="0.5" />
          {/* embrião */}
          <g transform="translate(45,74)">
            <circle r="20" fill="url(#embryo)" opacity="0.35" />
            <path d="M-4 -12 q14 4 6 14 q-10 6 -2 12" fill="none" stroke="#eafff7" strokeWidth="3" strokeLinecap="round" />
          </g>
          <rect x="18" y="130" width="54" height="14" rx="4" fill="#0e1a2b" stroke="#1d3350" />
        </svg>

        <div className="scale-x-[-1] opacity-80"><DnaHelix height={120} /></div>
      </div>

      {compatibility !== null && (
        <div className="mt-3 w-full rounded-lg border border-ok/30 bg-bg-800 px-4 py-2 text-center">
          <div className="text-[0.65rem] uppercase text-ink-muted">Compatibilidade genética</div>
          <div className="font-display text-2xl font-bold text-ok">{compatibility}%</div>
          <div className="text-[0.65rem] uppercase text-ink-muted">{label}</div>
        </div>
      )}
    </div>
  );
}
