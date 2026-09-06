import type { CrossResponse } from "../lib/api";
import { Creature } from "./Creature";
import { AuraStars } from "./AuraStars";
import { GenotypeChips, QtlBars } from "./Genome";

const METHOD_LABEL: Record<string, string> = {
  F1: "F1 · primeira geração", F2: "F2 · intercruzamento", F3: "F3 · terceira geração",
  BC1: "BC1 · retrocruzamento", LINE: "Line-breeding", INBREED: "Endocruzamento", OUTCROSS: "Outcross de resgate",
};

function fTone(f: number) {
  if (f > 0.2) return "text-crit";
  if (f > 0.15) return "text-warn";
  return "text-ink";
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-bg-900/60 px-3 py-2">
      <div className="text-[0.7rem] text-ink-muted">{label}</div>
      <div className={`font-mono text-lg ${tone ?? "text-ink"}`}>{value}</div>
    </div>
  );
}

/** Card do filhote: CRIATURA em destaque + fenótipo + genótipo + métricas (DS §5.2). */
export function SpecimenCard({ result }: { result: CrossResponse }) {
  const { engine, specimen } = result;
  const critical = engine.fPedigree > 0.2;

  return (
    <article
      className={`reveal overflow-hidden rounded-card border bg-bg-800 ${
        critical ? "border-crit shadow-neon-red" : "border-purple/50 shadow-neon-purple"
      }`}
    >
      {/* Retrato */}
      <div className="relative border-b border-white/5 bg-bg-studio">
        <div className="mx-auto grid aspect-video max-w-md place-items-center py-2">
          <Creature genotype={engine.genotype} family={specimen.pack} viable={engine.phenotype.viable} seed={result.cacheKey} size={240} />
        </div>
        <div className="absolute right-3 top-3">
          <AuraStars value={engine.aura} />
        </div>
      </div>

      <div className="p-6">
        <div className="text-xs text-ink-muted">
          {METHOD_LABEL[engine.method] ?? engine.method} · geração {engine.generation}
        </div>
        <h3 className="font-display text-2xl font-bold uppercase text-ink">{specimen.species}</h3>
        {!engine.phenotype.viable && (
          <div className="mt-1 font-display text-sm uppercase text-crit">embrião inviável</div>
        )}

        <section className="mt-5">
          <h4 className="mb-2 font-display text-xs font-bold uppercase text-cyan">Fenótipo</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(engine.phenotype.loci).map(([locus, desc]) => (
              <span key={locus} className="rounded-md bg-bg-900 px-2.5 py-1 text-sm text-ink">{desc}</span>
            ))}
          </div>
          {engine.phenotype.epistasis.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">Epistasia: {engine.phenotype.epistasis.join(", ")}</p>
          )}
          {engine.phenotype.hasMutation && <p className="mt-2 text-xs text-warn">Mutação espontânea detectada.</p>}
        </section>

        <section className="mt-5">
          <h4 className="mb-2 font-display text-xs font-bold uppercase text-cyan">Genótipo</h4>
          <GenotypeChips genotype={engine.genotype} />
          <div className="mt-4"><QtlBars qtl={engine.genotype.qtl} /></div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="F de Wright" value={engine.fPedigree.toFixed(2)} tone={fTone(engine.fPedigree)} />
          <Metric label="Índice de Fixação" value={engine.fixationIndex.toFixed(2)} />
          <Metric label="Fertilidade" value={`${Math.round(engine.fertility.score)}`} />
          <Metric label="Risco embrião" value={`${Math.round(engine.fertility.inviabilityRisk * 100)}%`} tone={engine.fertility.inviabilityRisk > 0 ? "text-crit" : undefined} />
        </section>

        <footer className="mt-4 flex items-center justify-between text-[0.7rem] text-ink-muted">
          <span>proveniência {specimen.sireId} × {specimen.damId}</span>
          <span className="font-mono">{result.cacheKey.slice(0, 12)}…</span>
        </footer>
      </div>
    </article>
  );
}
