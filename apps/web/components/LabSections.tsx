"use client";

import type { ApiSpecimen } from "../lib/api";
import { buildGrid, type Family } from "../lib/lab";

/** Quadro de Punnett por gametas com miniaturas + % reais (mockup Image 2). */
export function PunnettGridView({ sire, dam }: { sire: ApiSpecimen; dam: ApiSpecimen }) {
  const grid = buildGrid(sire, dam);
  const total = grid.rows.length * grid.cols.length;
  return (
    <div className="rounded-card border border-cyan/30 bg-bg-800 p-4">
      <h3 className="mb-3 font-display text-xs font-bold uppercase text-cyan">Quadro de Punnett — probabilidade de fenótipos</h3>
      <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${grid.cols.length}, 1fr)` }}>
        <div />
        {grid.cols.map((c) => <div key={c.label} className="text-center font-mono text-[0.7rem] text-cyan">{c.label}</div>)}
        {grid.rows.map((r, ri) => (
          <FragmentRow key={r.label} label={r.label} cells={grid.cells[ri]!} family={grid.family} />
        ))}
      </div>
      <div className="mt-3 text-center text-[0.7rem] uppercase text-ink-muted">Total de combinações possíveis: {total}</div>
      {/* O quadro só cabe até 2 loci (senão a grade explode) — o rodapé
          diz o que ficou de fora e por quê, pra não parecer que só esses
          loci existem no cruzamento (b). */}
      {grid.fixedLoci.length > 0 && (
        <div className="mt-1 text-center text-[0.6rem] text-ink-muted">
          Sem segregação em: {grid.fixedLoci.join(", ")} (pais homozigotos — sem variação possível)
        </div>
      )}
      {grid.extraSegregatingLoci.length > 0 && (
        <div className="mt-1 text-center text-[0.6rem] text-ink-muted">
          Também segregam, mas não cabem no quadro: {grid.extraSegregatingLoci.join(", ")}
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  label, cells, family,
}: {
  label: string;
  cells: { genotype: import("@genbreedai/shared").Genotype; prob: number }[];
  family: Family;
}) {
  return (
    <>
      <div className="flex items-center justify-center font-mono text-[0.7rem] text-purple">{label}</div>
      {cells.map((cell, i) => (
        <div key={i} className="rounded-md border border-white/10 bg-bg-900/60 p-1 text-center">
          <div className="mx-auto grid aspect-square w-full place-items-center overflow-hidden rounded bg-bg-900/60 p-1">
            <span className="font-mono text-[0.55rem] leading-tight text-cyan/80">
              {Object.entries(cell.genotype.loci).slice(0,3).map(([k,v]) => `${k}:${v[0]}${v[1]}`).join(" ")}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[0.65rem] text-ink">{(cell.prob * 100).toFixed(0)}%</div>
        </div>
      ))}
    </>
  );
}

/** Barra de risco de endogamia com marcador na posição do F real (mockup). */
export function InbreedingGauge({ f }: { f: number }) {
  const risk = f > 0.25 ? "Risco alto" : f > 0.15 ? "Risco moderado" : f > 0.06 ? "Risco leve" : "Risco baixo";
  const tone = f > 0.25 ? "text-crit" : f > 0.15 ? "text-warn" : "text-ok";
  const pos = Math.min(1, f / 0.5) * 100;
  return (
    <div className="rounded-card border border-purple/30 bg-bg-800 p-4">
      <h3 className="mb-2 font-display text-xs font-bold uppercase text-purple">Coeficiente de endogamia (F)</h3>
      <div className="text-center font-display text-3xl font-bold text-ink">F = {f.toFixed(3).replace(".", ",")}</div>
      <div className="mt-3 text-center text-[0.7rem] uppercase text-ink-muted">Risco de endogamia</div>
      <div className="relative mt-2">
        <div className="h-2.5 rounded-full" style={{ background: "linear-gradient(90deg,#00FF9D,#FFC107 45%,#FF8A3B 70%,#FF3B5C)" }} />
        <div className="absolute -top-1.5 -translate-x-1/2" style={{ left: `${pos}%` }}>
          <div className="h-0 w-0 border-x-4 border-t-[7px] border-x-transparent border-t-ink" />
        </div>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.6rem] text-ink-muted">
        <span>0</span><span>0,06</span><span>0,125</span><span>0,25</span><span>0,50+</span>
      </div>
      <div className={`mt-3 text-center font-display text-sm font-bold uppercase ${tone}`}>{risk}</div>
    </div>
  );
}

export function CurrencyBar() {
  return (
    <div className="flex gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-ok/30 bg-bg-800 px-3 py-1.5">
        <span className="text-ok">🌿</span>
        <div className="leading-none"><div className="text-[0.6rem] uppercase text-ink-muted">Biomassa</div><div className="font-mono text-sm text-ink">125.480</div></div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-cyan/30 bg-bg-800 px-3 py-1.5">
        <span className="text-cyan">⬢</span>
        <div className="leading-none"><div className="text-[0.6rem] uppercase text-ink-muted">Catalisadores</div><div className="font-mono text-sm text-ink">3.420</div></div>
      </div>
    </div>
  );
}

export function BottomNav() {
  const items = ["Laboratório", "Criações", "Gene Bank", "Linhagens", "Loja"];
  return (
    <nav className="mt-10 flex items-center justify-around rounded-card border border-white/10 bg-bg-800/80 py-3 text-[0.65rem] uppercase tracking-wide">
      {items.map((it, i) => <span key={it} className={i === 0 ? "font-display font-bold text-cyan" : "text-ink-muted"}>{it}</span>)}
    </nav>
  );
}
