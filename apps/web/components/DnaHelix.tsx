/** Hélice de DNA vertical, gradiente ciano→púrpura, rotação lenta (DS §2.3). */
export function DnaHelix({ height = 160 }: { height?: number }) {
  return (
    <svg
      viewBox="0 0 40 160"
      width={40}
      height={height}
      aria-hidden="true"
      className="dna-spin"
      style={{ transformOrigin: "center" }}
    >
      <defs>
        <linearGradient id="dna-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00F0FF" />
          <stop offset="100%" stopColor="#BF00FF" />
        </linearGradient>
      </defs>
      <path d="M8 0 C32 26 32 54 8 80 C-16 106 -16 134 8 160" fill="none" stroke="url(#dna-grad)" strokeWidth="2.5" />
      <path d="M32 0 C8 26 8 54 32 80 C56 106 56 134 32 160" fill="none" stroke="url(#dna-grad)" strokeWidth="2.5" opacity="0.7" />
      {Array.from({ length: 9 }).map((_, i) => {
        const y = 8 + i * 18;
        return <line key={i} x1="8" y1={y} x2="32" y2={y} stroke="url(#dna-grad)" strokeWidth="1.5" opacity="0.6" />;
      })}
    </svg>
  );
}
