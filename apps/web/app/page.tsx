"use client";

import { useEffect, useMemo, useState } from "react";
import { listSpecimens, postCross, type ApiSpecimen, type CrossResponse } from "../lib/api";
import { previewCross } from "../lib/preview";
import { Capsule } from "../components/Capsule";
import { DnaHelix } from "../components/DnaHelix";
import { PunnettPreview } from "../components/PunnettPreview";
import { SpecimenCard } from "../components/SpecimenCard";

const METHODS = ["F1", "F2", "F3", "BC1", "LINE", "INBREED", "OUTCROSS"] as const;

function ParentSelect({
  slot, specimens, value, onChange,
}: {
  slot: "cyan" | "purple";
  specimens: ApiSpecimen[];
  value: string;
  onChange: (id: string) => void;
}) {
  const focus = slot === "cyan" ? "focus:border-cyan" : "focus:border-purple";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border border-white/10 bg-bg-900 px-3 py-2.5 text-ink ${focus}`}
    >
      <option value="">selecionar…</option>
      {specimens.map((s) => (
        <option key={s.id} value={s.id}>{s.id} · {s.species} ({s.pack})</option>
      ))}
    </select>
  );
}

export default function LabPage() {
  const [specimens, setSpecimens] = useState<ApiSpecimen[]>([]);
  const [sireId, setSireId] = useState("");
  const [damId, setDamId] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("F1");
  const [result, setResult] = useState<CrossResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    listSpecimens().then(setSpecimens).catch((e) => setListError(e.message));
  }, []);

  const sire = specimens.find((s) => s.id === sireId) ?? null;
  const dam = specimens.find((s) => s.id === damId) ?? null;
  const preview = useMemo(
    () => (sire && dam ? previewCross(sire, dam, specimens) : null),
    [sire, dam, specimens],
  );

  async function onCross() {
    if (!sire || !dam) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await postCross({ sireId: sire.id, damId: dam.id, method }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-8 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-black uppercase text-ink sm:text-3xl">Cruzar Espécies</h1>
        <span className="font-display text-xs uppercase tracking-widest text-ink-muted">GenBreedAI</span>
      </header>

      {listError && (
        <div className="mb-6 rounded-lg border border-crit/40 bg-crit/10 p-4 text-sm text-crit">
          {listError} — a API está no ar em :3001? Rode <code className="font-mono">pnpm dev</code>.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Bancada */}
        <section>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Capsule specimen={sire} slot="cyan" label="Progenitor A · Sire" />
            <div className="flex flex-col items-center gap-2">
              <DnaHelix height={140} />
              <span className="font-display text-xl text-ink-muted" aria-hidden>+</span>
            </div>
            <Capsule specimen={dam} slot="purple" label="Progenitor B · Dam" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <ParentSelect slot="cyan" specimens={specimens} value={sireId} onChange={setSireId} />
            <ParentSelect slot="purple" specimens={specimens} value={damId} onChange={setDamId} />
          </div>

          <label className="mt-3 block">
            <span className="mb-1.5 block font-display text-xs uppercase tracking-wide text-ink-muted">Estratégia</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
              className="w-full rounded-lg border border-white/10 bg-bg-900 px-3 py-2.5 text-ink focus:border-cyan"
            >
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          {preview && (
            <div className="mt-6 rounded-card border border-white/10 bg-bg-800 p-4">
              <h3 className="mb-3 font-display text-xs font-bold uppercase text-cyan">Prévia da prole</h3>
              <PunnettPreview preview={preview} />
            </div>
          )}

          <button
            onClick={onCross}
            disabled={!preview?.compatible || loading}
            className="mt-6 w-full rounded-xl bg-cyan px-4 py-3 font-display font-bold uppercase tracking-wide text-bg-900 shadow-neon-cyan transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ink-muted disabled:shadow-none"
          >
            {loading ? "Processando…" : "Cruzar espécies"}
          </button>
          {error && <p className="mt-3 text-sm text-crit">{error}</p>}
        </section>

        {/* Resultado */}
        <section>
          {result ? (
            <SpecimenCard result={result} />
          ) : (
            <div className="flex h-full min-h-80 items-center justify-center rounded-card border border-dashed border-white/10 p-6 text-center text-ink-muted">
              Preencha as duas cápsulas, confira a prévia e cruze para revelar o filhote.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
