"use client";

import type { ApiSpecimen } from "../lib/api";
import { buildGrid, topHybrids, familyOf, type Hybrid } from "../lib/lab";

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
    </div>
  );
}

function FragmentRow({
  label, cells, family,
}: {
  label: string;
  cells: { genotype: import("@genbreedai/shared").Genotype; prob: number; base: string }[];
  family: import("../lib/appearance").Family;
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

const QTL_ABBR: Record<string,string> = { porte:"POR", vigor:"VIG", beleza:"BEL", temperamento:"TMP", rosetas:"ROS" };

/** Prévia dos 3 híbridos mais prováveis, com setas por atributo (mockup Image 2). */
export function HybridPreview({ sire, dam }: { sire: ApiSpecimen; dam: ApiSpecimen }) {
  const hybrids = topHybrids(sire, dam, 3);
  const mid: Record<string, number> = {};
  for (const k of Object.keys(sire.genotype.qtl)) mid[k] = ((sire.genotype.qtl[k] ?? 0) + (dam.genotype.qtl[k] ?? 0)) / 2;
  return (
    <div>
      <h3 className="mb-3 font-display text-xs font-bold uppercase text-cyan">Prévia dos 3 híbridos mais prováveis</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {hybrids.map((h, i) => <HybridCard key={i} h={h} idx={i + 1} family={familyOf(sire.pack)} mid={mid} />)}
      </div>
      <p className="mt-2 text-center text-[0.7rem] text-ink-muted">As probabilidades são estimadas e podem variar após a síntese.</p>
    </div>
  );
}

function HybridCard({ h, idx, family, mid }: { h: Hybrid; idx: number; family: import("../lib/appearance").Family; mid: Record<string, number> }) {
  const qtl = h.genotype.qtl;
  return (
    <div className="rounded-card border border-cyan/25 bg-bg-800 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="grid h-5 w-5 place-items-center rounded-full border border-cyan/50 font-mono text-[0.65rem] text-cyan">{idx}</span>
        <span className="rounded bg-purple/20 px-1.5 py-0.5 font-mono text-[0.65rem] text-purple">{(h.prob * 100).toFixed(0)}%</span>
      </div>
      <div className="grid min-h-[60px] place-items-center rounded bg-bg-900/60 p-2 text-center">
        <span className="font-mono text-[0.6rem] text-cyan/80">
          {Object.entries(h.genotype.loci).slice(0, 4).map(([k, v]) => `${k}:${v[0]}${v[1]}`).join("  ")}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {Object.entries(qtl).slice(0,4).map(([k, vv]) => {
          const v = vv ?? 0, m = mid[k] ?? 0.5, lbl = QTL_ABBR[k] ?? k.slice(0,3).toUpperCase();
          const arrow = v > m + 0.01 ? "↑" : v < m - 0.01 ? "↓" : "=";
          const tone = arrow === "↑" ? "text-ok" : arrow === "↓" ? "text-crit" : "text-ink-muted";
          return (
            <div key={k} className="text-center">
              <div className="font-mono text-[0.55rem] text-ink-muted">{lbl}</div>
              <div className={`font-display text-sm font-bold ${tone}`}>{arrow}</div>
            </div>
          );
        })}
      </div>
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
