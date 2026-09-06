"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listSpecimens, postCross, type ApiSpecimen } from "../lib/api";
import { compatibility } from "../lib/lab";
import { CapsuleCard } from "../components/CapsuleCard";
import { FertilizationCore } from "../components/FertilizationCore";
import { PunnettGridView, InbreedingGauge, HybridPreview, CurrencyBar } from "../components/LabSections";
import { wrightF } from "@genbreedai/engine";

const METHODS = ["F1", "F2", "F3", "BC1", "LINE", "INBREED", "OUTCROSS"] as const;

export default function LabPage() {
  const router = useRouter();
  const [specimens, setSpecimens] = useState<ApiSpecimen[]>([]);
  const [sireId, setSireId] = useState("");
  const [damId, setDamId] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("F1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    listSpecimens().then(setSpecimens).catch((e) => setListError(e.message));
  }, []);

  const sire = specimens.find((s) => s.id === sireId) ?? null;
  const dam = specimens.find((s) => s.id === damId) ?? null;
  const compatible = sire && dam && sire.pack === dam.pack;

  const fPed = useMemo(() => {
    if (!sire || !dam) return null;
    const ped: Record<string, { id: string; sire: string | null; dam: string | null }> = {};
    for (const s of specimens) ped[s.id] = { id: s.id, sire: s.sireId, dam: s.damId };
    return wrightF(ped, sire.id, dam.id);
  }, [sire, dam, specimens]);

  const compat = compatible ? compatibility(sire!, dam!) : null;

  async function onCross() {
    if (!sire || !dam) return;
    setLoading(true);
    setError(null);
    try {
      const res = await postCross({ sireId: sire.id, damId: dam.id, method });
      router.push(`/reveal/${res.specimen.id}`);
      return;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-5">
      {/* Cabeçalho + moedas */}
      <header className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-black uppercase text-ink">Genetic Lab</h1>
          <p className="text-[0.7rem] uppercase tracking-widest text-ink-muted">Laboratório de síntese genética</p>
        </div>
        <CurrencyBar />
      </header>

      {listError && (
        <div className="mb-5 rounded-lg border border-crit/40 bg-crit/10 p-4 text-sm text-crit">
          {listError} — a API está no ar em :3001? Rode <code className="font-mono">pnpm dev</code>.
        </div>
      )}

      {/* Progenitores + fertilização */}
      <section className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
        <div>
          <CapsuleCard specimen={sire} slot="A" />
          <select value={sireId} onChange={(e) => setSireId(e.target.value)} className="mt-2 w-full rounded-lg border border-cyan/30 bg-bg-900 px-3 py-2 text-ink focus:border-cyan">
            <option value="">selecionar progenitor A…</option>
            {specimens.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.species}</option>)}
          </select>
        </div>

        <div className="flex flex-col items-center gap-3 py-2">
          <FertilizationCore compatibility={compat} />
          <select value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])} className="w-40 rounded-lg border border-white/10 bg-bg-900 px-2 py-1.5 text-center text-sm text-ink focus:border-cyan">
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <CapsuleCard specimen={dam} slot="B" />
          <select value={damId} onChange={(e) => setDamId(e.target.value)} className="mt-2 w-full rounded-lg border border-purple/30 bg-bg-900 px-3 py-2 text-ink focus:border-purple">
            <option value="">selecionar progenitor B…</option>
            {specimens.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.species}</option>)}
          </select>
        </div>
      </section>

      {/* Punnett + endogamia */}
      {compatible && (
        <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PunnettGridView sire={sire!} dam={dam!} />
          {fPed !== null && <InbreedingGauge f={fPed} />}
        </section>
      )}
      {sire && dam && !compatible && (
        <div className="mt-5 rounded-card border border-crit/40 bg-crit/10 p-4 text-sm text-crit">
          Espécies de packs distintos ({sire.pack} × {dam.pack}) — cruzamento incompatível.
        </div>
      )}

      {/* Prévia dos 3 híbridos */}
      {compatible && (
        <section className="mt-5">
          <HybridPreview sire={sire!} dam={dam!} />
        </section>
      )}

      {/* Botão sintetizar */}
      <button
        onClick={onCross}
        disabled={!compatible || loading}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-ok px-4 py-4 font-display text-lg font-black uppercase tracking-wide text-bg-900 shadow-neon-green transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ink-muted disabled:shadow-none"
      >
        {loading ? "Sintetizando…" : "Sintetizar genoma"}
        {compatible && <span className="font-mono text-sm opacity-80">🌿 25.000 · ⬢ 750</span>}
      </button>
      {error && <p className="mt-3 text-center text-sm text-crit">{error}</p>}


    </main>
  );
}
