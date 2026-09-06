import type { CrossPreview } from "../lib/preview";

function LocusBar({ phenotypes }: { phenotypes: Array<{ label: string; p: number }> }) {
  const palette = ["bg-cyan", "bg-purple", "bg-cyan/60", "bg-ink-muted"];
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-bg-900">
      {phenotypes.map((ph, i) => (
        <div key={ph.label} className={palette[i % palette.length]} style={{ width: `${ph.p * 100}%` }} title={`${ph.label}: ${(ph.p * 100).toFixed(0)}%`} />
      ))}
    </div>
  );
}

/** Prévia (Punnett + F de Wright + letalidade) calculada no cliente pelo motor. */
export function PunnettPreview({ preview }: { preview: CrossPreview }) {
  if (!preview.compatible) {
    return <div className="rounded-lg border border-crit/40 bg-crit/10 p-4 text-sm text-crit">{preview.reason}</div>;
  }
  const fTone = preview.fPedigree > 0.2 ? "text-crit" : preview.fPedigree > 0.15 ? "text-warn" : "text-ink";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="text-ink-muted">
          F de Wright previsto: <span className={`font-mono ${fTone}`}>{preview.fPedigree.toFixed(2)}</span>
        </span>
        {preview.interspecific && <span className="text-purple">interespecífico</span>}
      </div>
      {preview.lethals.map((l) => (
        <div key={l.locus} className="rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          Risco letal ({l.label}): {(l.p * 100).toFixed(0)}% da prole no loco {l.locus}.
        </div>
      ))}
      <div className="space-y-3">
        {preview.loci.map((lp) => (
          <div key={lp.locus}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-mono text-xs text-ink-muted">loco {lp.locus}</span>
              <span className="text-xs text-ink-muted">
                {lp.phenotypes.map((ph) => `${ph.label} ${(ph.p * 100).toFixed(0)}%`).join("  ·  ")}
              </span>
            </div>
            <LocusBar phenotypes={lp.phenotypes} />
          </div>
        ))}
      </div>
    </div>
  );
}
