import type { CrossResponse } from "@/lib/api";
import { AuraStars } from "./AuraStars";
import { GenotypeChips, QtlBars } from "./Genome";

const METHOD_LABEL: Record<string, string> = {
  F1: "F1 · primeira geração",
  F2: "F2 · intercruzamento",
  F3: "F3 · terceira geração",
  BC1: "BC1 · retrocruzamento",
  LINE: "Line-breeding",
  INBREED: "Endocruzamento",
  OUTCROSS: "Outcross de resgate",
};

function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg border border-base-500 bg-base-800/60 px-3 py-2">
      <div className="text-[0.7rem] text-ink-500">{label}</div>
      <div className={`font-mono text-lg ${tone === "danger" ? "text-danger-400" : "text-ink-100"}`}>
        {value}
      </div>
    </div>
  );
}

/**
 * Card do espécime resultante. Prioriza FENÓTIPO e GENÓTIPO (escolha do brief),
 * com auras, métricas biológicas (F, fertilidade) e de jogo (IF) logo abaixo.
 */
export function SpecimenCard({ result }: { result: CrossResponse }) {
  const { engine, specimen } = result;
  const phenLoci = Object.entries(engine.phenotype.loci);

  return (
    <article className="reveal rounded-2xl border border-base-500 bg-base-700 p-6 shadow-panel">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-ink-500">
            {METHOD_LABEL[engine.method] ?? engine.method} · geração {engine.generation}
          </div>
          <h3 className="font-display text-2xl font-semibold text-ink-100">
            {specimen.species}
          </h3>
        </div>
        <div className="text-right">
          <AuraStars value={engine.aura} />
          {!engine.phenotype.viable && (
            <div className="mt-1 text-sm font-medium text-danger-400">embrião inviável</div>
          )}
        </div>
      </header>

      {/* FENÓTIPO */}
      <section className="mb-5">
        <h4 className="mb-2 font-display text-sm font-medium text-gene-400">Fenótipo</h4>
        <div className="flex flex-wrap gap-2">
          {phenLoci.map(([locus, desc]) => (
            <span
              key={locus}
              className="rounded-md bg-base-600 px-2.5 py-1 text-sm text-ink-100"
            >
              {desc}
            </span>
          ))}
        </div>
        {engine.phenotype.epistasis.length > 0 && (
          <p className="mt-2 text-xs text-ink-500">
            Epistasia: {engine.phenotype.epistasis.join(", ")}
          </p>
        )}
        {engine.phenotype.hasMutation && (
          <p className="mt-2 text-xs text-aura-400">Mutação espontânea detectada.</p>
        )}
      </section>

      {/* GENÓTIPO */}
      <section className="mb-5">
        <h4 className="mb-2 font-display text-sm font-medium text-gene-400">Genótipo</h4>
        <GenotypeChips genotype={engine.genotype} />
        <div className="mt-4">
          <QtlBars qtl={engine.genotype.qtl} />
        </div>
      </section>

      {/* MÉTRICAS */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="F de Wright" value={engine.fPedigree.toFixed(2)} />
        <Metric label="Índice de Fixação" value={engine.fixationIndex.toFixed(2)} />
        <Metric label="Fertilidade" value={`${Math.round(engine.fertility.score)}`} />
        <Metric
          label="Risco embrião"
          value={`${Math.round(engine.fertility.inviabilityRisk * 100)}%`}
          tone={engine.fertility.inviabilityRisk > 0 ? "danger" : undefined}
        />
      </section>

      <footer className="mt-4 flex items-center justify-between text-[0.7rem] text-ink-500">
        <span>
          proveniência {specimen.sireId} × {specimen.damId}
        </span>
        <span className="font-mono" title="chave de cache determinística">
          {result.cacheKey.slice(0, 12)}…
        </span>
      </footer>
    </article>
  );
}
