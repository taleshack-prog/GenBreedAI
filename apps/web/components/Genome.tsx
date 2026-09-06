import type { Genotype } from "@genbreedai/shared";

/** Formata alelo: "K^br" → K com "br" sobrescrito; realça mutação. */
function Allele({ raw }: { raw: string }) {
  const mut = raw.includes("⟦mutação⟧");
  const clean = raw.replace("⟦mutação⟧", "");
  const [base, sup] = clean.split("^");
  return (
    <span className={mut ? "text-warn" : undefined}>
      {base}
      {sup && <sup className="text-[0.7em]">{sup}</sup>}
      {mut && <span title="alelo mutante"> •</span>}
    </span>
  );
}

/** Genótipo: chip por loco (fonte mono — símbolos de código). Homozigoto = ciano. */
export function GenotypeChips({ genotype }: { genotype: Genotype }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(genotype.loci).map(([locus, pair]) => {
        const homo = pair[0].replace("⟦mutação⟧", "") === pair[1].replace("⟦mutação⟧", "");
        return (
          <span
            key={locus}
            className={`inline-flex items-baseline gap-1 rounded-md border px-2 py-1 font-mono text-sm ${
              homo ? "border-cyan/40 bg-cyan/10" : "border-white/10 bg-bg-900/60"
            }`}
          >
            <span className="text-xs text-ink-muted">{locus}</span>
            <span className="text-ink">
              <Allele raw={pair[0]} />
              <span className="text-ink-muted">/</span>
              <Allele raw={pair[1]} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

const QTL_LABEL: Record<string, string> = {
  porte: "Porte", vigor: "Vigor", beleza: "Beleza", temperamento: "Temperamento", rosetas: "Rosetas",
};

/** QTLs em barras púrpura (traços quantitativos). */
export function QtlBars({ qtl }: { qtl: Record<string, number> }) {
  const entries = Object.entries(qtl);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {entries.map(([trait, value]) => (
        <div key={trait}>
          <div className="mb-1 flex justify-between text-xs text-ink-muted">
            <span>{QTL_LABEL[trait] ?? trait}</span>
            <span className="font-mono">{value.toFixed(2)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-bg-900">
            <div className="h-full rounded-full bg-purple" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
