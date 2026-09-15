/**
 * Rótulo de seção ("kicker"). Antes era um "// texto" monoespaçado sutil que
 * lia como comentário de código esquecido — virou um chip com peso e cor
 * fortes o bastante pra parecer intencional, mantendo a fonte mono do tema.
 */
export function Eyebrow({ children, color = "#00F0FF" }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="mb-4 flex justify-center">
      <div className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5" style={{ borderColor: `${color}66`, backgroundColor: `${color}1F` }}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
        <span className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.15em]" style={{ color }}>{children}</span>
      </div>
    </div>
  );
}
