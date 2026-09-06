import type { CrossPreview } from "@/lib/preview";

/** Barra empilhada de probabilidades fenotípicas de um loco. */
function LocusBar({ phenotypes }: { phenotypes: Array<{ label: string; p: number }> }) {
  const palette = ["bg-gene-400", "bg-qtl-400", "bg-gene-600", "bg-ink-500"];
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-base-600">
      {phenotypes.map((ph, i) => (
        <div
          key={ph.label}
          className={palette[i % palette.length]}
          style={{ width: `${ph.p * 100}%` }}
          title={`${ph.label}: ${(ph.p * 100).toFixed(0)}%`}
        />
      ))}
    </div>
  );
}

/**
 * Prévia do cruzamento ANTES de confirmar: distribuição fenotípica possível por
 * loco (Punnett), F de Wright estimado e alertas de letalidade. Calculada no
 * cliente pelo motor — determinística, sem custo de API.
 */
export function PunnettPreview({ preview }: { preview: CrossPreview }) {
  if (!preview.compatible) {
    return (
      <div className="rounded-lg border border-danger-400/40 bg-danger-400/10 p-4 text-sm text-danger-400">
        {preview.reason}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="text-ink-300">
          F de Wright previsto:{" "}
          <span className="font-mono text-ink-100">{preview.fPedigree.toFixed(2)}</span>
        </span>
        {preview.interspecific && (
          <span className="text-ink-500">cruzamento interespecífico</span>
        )}
      </div>

      {preview.lethals.map((l) => (
        <div
          key={l.locus}
          className="rounded-lg border border-danger-400/40 bg-danger-400/10 px-3 py-2 text-sm text-danger-400"
        >
          Risco letal ({l.label}): {(l.p * 100).toFixed(0)}% da prole no loco {l.locus}.
        </div>
      ))}

      <div className="space-y-3">
        {preview.loci.map((lp) => (
          <div key={lp.locus}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-mono text-xs text-ink-500">loco {lp.locus}</span>
              <span className="text-xs text-ink-300">
                {lp.phenotypes
                  .map((ph) => `${ph.label} ${(ph.p * 100).toFixed(0)}%`)
                  .join("  ·  ")}
              </span>
            </div>
            <LocusBar phenotypes={lp.phenotypes} />
          </div>
        ))}
      </div>
    </div>
  );
}
