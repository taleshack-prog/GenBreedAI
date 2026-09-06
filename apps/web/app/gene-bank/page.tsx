"use client";

import { useEffect, useState } from "react";
import { listSpecimens, type ApiSpecimen } from "../../lib/api";
import { CapsuleCard } from "../../components/CapsuleCard";

/** Tela Gene Bank (mockup Image 3): grade de cards-cápsula ordenados por F. */
export default function GeneBankPage() {
  const [specimens, setSpecimens] = useState<ApiSpecimen[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { listSpecimens().then(setSpecimens).catch((e) => setErr(e.message)); }, []);
  const sorted = [...specimens].sort((a, b) => a.fPedigree - b.fPedigree);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-black uppercase text-ink">Gene Bank</h1>
          <p className="text-[0.7rem] uppercase tracking-widest text-ink-muted">Criopreservação de genótipos</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-cyan/30 bg-bg-800 px-3 py-1.5">
          <span className="text-cyan">⬢</span>
          <div className="leading-none"><div className="text-[0.6rem] uppercase text-ink-muted">Catalisadores</div><div className="font-mono text-sm text-ink">12.450</div></div>
        </div>
      </header>

      <p className="mb-4 text-sm text-ink-muted">Armazene e gerencie genótipos raros. Descongele para retrocruzar e fortalecer linhagens.</p>

      {err && <div className="mb-4 rounded-lg border border-crit/40 bg-crit/10 p-4 text-sm text-crit">{err} — a API está no ar? <code className="font-mono">pnpm dev</code></div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sorted.map((s) => (
          <CapsuleCard key={s.id} specimen={s} selected={selected === s.id} onClick={() => setSelected(s.id)} />
        ))}
      </div>

      <button
        disabled={!selected}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-ok px-4 py-4 font-display font-black uppercase tracking-wide text-bg-900 shadow-neon-green transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ink-muted disabled:shadow-none"
      >
        ❄ Descongelar para retrocruzar →
      </button>

    </main>
  );
}
