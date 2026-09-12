"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getGenome, type GenomeResponse, type LineageNode } from "../../../lib/api";
import { speciesInfo } from "@genbreedai/shared";

function TreeNode({ node, depth = 0, cor }: { node: LineageNode | null; depth?: number; cor: string }) {
  if (!node) return null;
  const info = speciesInfo(node.species);
  return (
    <div className="ml-3 border-l border-white/10 pl-3">
      <div className="flex items-center gap-2 py-1">
        <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
        <span className="font-display text-xs font-bold uppercase" style={{ color: cor }}>{info.common}</span>
        <span className="font-mono text-[0.6rem] text-ink-muted">GEN {node.generation} · F {node.fPedigree.toFixed(2)} · {node.method}</span>
      </div>
      {(node.sire || node.dam) && (
        <div>
          <TreeNode node={node.sire} depth={depth + 1} cor="#00F0FF" />
          <TreeNode node={node.dam} depth={depth + 1} cor="#BF00FF" />
        </div>
      )}
    </div>
  );
}

export default function GenomePage() {
  const { id } = useParams<{ id: string }>();
  const [g, setG] = useState<GenomeResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getGenome(id).then(setG).catch((e) => setErr(e.message)); }, [id]);

  if (err) return <main className="mx-auto max-w-2xl px-4 pb-28 pt-10"><div className="rounded-card border border-crit/40 bg-crit/10 p-4 text-crit">{err}</div></main>;
  if (!g) return <main className="mx-auto max-w-2xl px-4 pb-28 pt-10 text-ink-muted">Carregando genoma…</main>;

  const info = speciesInfo(g.specimen.species);
  const qtl = g.specimen.genotype.qtl;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-black uppercase text-ink" style={{ textShadow: "0 0 10px rgba(0,240,255,.35)" }}>Genoma</h1>
        <p className="font-display text-sm font-bold uppercase text-cyan">{info.common}</p>
        <p className="text-xs italic text-ink-muted">{info.scientific} · GEN {g.specimen.generation}</p>
      </header>

      {/* Fenótipo × Genótipo por loco */}
      <section className="mb-5 rounded-card border border-cyan/20 bg-bg-800 p-4">
        <h2 className="mb-3 font-display text-xs font-bold uppercase text-cyan">Loci · alelos · expressão</h2>
        <div className="overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead><tr className="bg-bg-900 font-mono text-[0.65rem] uppercase text-ink-muted">
              <th className="px-3 py-2 text-left">Loco</th><th className="px-3 py-2 text-left">Genótipo</th><th className="px-3 py-2 text-left">Fenótipo</th>
            </tr></thead>
            <tbody>
              {Object.entries(g.specimen.genotype.loci).map(([k, v]) => (
                <tr key={k} className="border-t border-white/5">
                  <td className="px-3 py-2 font-mono text-cyan">{k}</td>
                  <td className="px-3 py-2 font-mono text-ink">{v[0]}/{v[1]}</td>
                  <td className="px-3 py-2 text-ink-muted">{g.phenotype.loci[k] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {g.phenotype.epistasis.length > 0 && <p className="mt-2 text-[0.7rem] text-amber">Epistasia: {g.phenotype.epistasis.join(", ")}</p>}
      </section>

      {/* QTL */}
      <section className="mb-5 rounded-card border border-cyan/20 bg-bg-800 p-4">
        <h2 className="mb-3 font-display text-xs font-bold uppercase text-cyan">QTL (traços quantitativos)</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {Object.entries(qtl).map(([k, v]) => (
            <div key={k}>
              <div className="mb-1 flex justify-between text-xs text-ink-muted"><span className="capitalize">{k}</span><span className="font-mono">{v.toFixed(2)}</span></div>
              <div className="h-1.5 rounded-full bg-bg-900"><div className="h-full rounded-full bg-purple" style={{ width: `${Math.round(v * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      {/* F de Wright decomposto */}
      <section className="mb-5 rounded-card border border-cyan/20 bg-bg-800 p-4">
        <h2 className="mb-1 font-display text-xs font-bold uppercase text-cyan">Coeficiente de Wright (F) — decomposição</h2>
        <div className="mb-2 font-display text-3xl font-black text-ink">F = {g.fExplain.total.toFixed(3)}</div>
        <p className="mb-3 text-[0.7rem] text-ink-muted">{g.fExplain.note}</p>
        {g.fExplain.paths.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead><tr className="bg-bg-900 font-mono text-[0.6rem] uppercase text-ink-muted">
                <th className="px-2 py-1.5 text-left">Ancestral comum</th><th className="px-2 py-1.5">n₁</th><th className="px-2 py-1.5">n₂</th><th className="px-2 py-1.5">F_A</th><th className="px-2 py-1.5 text-right">Contrib.</th>
              </tr></thead>
              <tbody>
                {g.fExplain.paths.map((p, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-2 py-1.5 text-cyan">{speciesInfo((g.lineage && findSpecies(g.lineage, p.ancestor)) || p.ancestor).common}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{p.n1}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{p.n2}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{p.fAncestor.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-ink">{p.contribution.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 font-mono text-[0.6rem] text-ink-muted">F = Σ (½)^(n₁+n₂+1) · (1 + F_A)</p>
      </section>

      {/* Origem dos alelos */}
      <section className="mb-5 rounded-card border border-cyan/20 bg-bg-800 p-4">
        <h2 className="mb-3 font-display text-xs font-bold uppercase text-cyan">Origem dos alelos na linhagem</h2>
        <div className="space-y-1.5">
          {g.alleleSources.filter((a) => a.sources.length > 0).map((a, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-2 text-xs">
              <span className="rounded bg-bg-900 px-1.5 py-0.5 font-mono text-cyan">{a.locus}:{a.allele}</span>
              <span className="text-ink-muted">←</span>
              <span className="text-ink">{a.sources.map((s) => speciesInfo(s.split(" (")[0]!).common).filter((v, idx, arr) => arr.indexOf(v) === idx).join(", ")}</span>
            </div>
          ))}
          {g.alleleSources.every((a) => a.sources.length === 0) && <p className="text-xs text-ink-muted">Fundador — alelos originais (sem ancestrais).</p>}
        </div>
      </section>

      {/* Árvore genealógica */}
      <section className="mb-5 rounded-card border border-cyan/20 bg-bg-800 p-4">
        <h2 className="mb-3 font-display text-xs font-bold uppercase text-cyan">Árvore genealógica (profundidade {g.depth === 99 ? "total" : g.depth})</h2>
        {g.lineage && (g.lineage.sire || g.lineage.dam)
          ? <div className="text-sm"><TreeNode node={g.lineage.sire} cor="#00F0FF" /><TreeNode node={g.lineage.dam} cor="#BF00FF" /></div>
          : <p className="text-xs text-ink-muted">Fundador — sem ancestrais.</p>}
      </section>

      <Link href="/crosses" className="block w-full rounded-xl border border-white/10 py-3 text-center font-display text-sm uppercase tracking-wide text-ink-muted transition hover:text-ink">← Voltar</Link>
    </main>
  );
}

/** Acha a espécie de um id na árvore (para rotular o ancestral do F). */
function findSpecies(node: LineageNode | null, id: string): string | null {
  if (!node) return null;
  if (node.id === id) return node.species;
  return findSpecies(node.sire, id) ?? findSpecies(node.dam, id);
}
