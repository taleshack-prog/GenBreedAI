import type { Genotype } from "@genbreedai/shared";

/** Formata um alelo: "K^br" → K com "br" sobrescrito; remove marca de mutação. */
function Allele({ raw }: { raw: string }) {
  const mut = raw.includes("⟦mutação⟧");
  const clean = raw.replace("⟦mutação⟧", "");
  const [base, sup] = clean.split("^");
  return (
    <span className={mut ? "text-aura-400" : undefined}>
      {base}
      {sup && <sup className="text-[0.7em]">{sup}</sup>}
      {mut && <span title="alelo mutante"> •</span>}
    </span>
  );
}

/**
 * Genótipo: um chip por loco com o par de alelos (fonte mono — símbolos de
 * código, uso estrutural justificado). Homozigotos recebem borda mais fria.
 */
export function GenotypeChips({ genotype }: { genotype: Genotype }) {
  const entries = Object.entries(genotype.loci);
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([locus, pair]) => {
        const homo = pair[0].replace("⟦mutação⟧", "") === pair[1].replace("⟦mutação⟧", "");
        return (
          <span
            key={locus}
            className={`inline-flex items-baseline gap-1 rounded-md border px-2 py-1 font-mono text-sm ${
              homo ? "border-gene-600/40 bg-gene-600/10" : "border-base-500 bg-base-600/40"
            }`}
          >
            <span className="text-ink-500 text-xs">{locus}</span>
            <span className="text-ink-100">
              <Allele raw={pair[0]} />
              <span className="text-ink-500">/</span>
              <Allele raw={pair[1]} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

const QTL_LABEL: Record<string, string> = {
  porte: "Porte",
  vigor: "Vigor",
  beleza: "Beleza",
  temperamento: "Temperamento",
  rosetas: "Rosetas",
};

/** QTLs como barras em violeta frio (traços quantitativos, TDD §4.1). */
export function QtlBars({ qtl }: { qtl: Record<string, number> }) {
  const entries = Object.entries(qtl);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {entries.map(([trait, value]) => (
        <div key={trait}>
          <div className="mb-1 flex justify-between text-xs text-ink-500">
            <span>{QTL_LABEL[trait] ?? trait}</span>
            <span className="font-mono">{value.toFixed(2)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-base-600">
            <div
              className="h-full rounded-full bg-qtl-400"
              style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
