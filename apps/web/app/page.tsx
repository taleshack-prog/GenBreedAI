"use client";

import { useEffect, useMemo, useState } from "react";
import { listSpecimens, postCross, type ApiSpecimen, type CrossResponse } from "@/lib/api";
import { previewCross } from "@/lib/preview";
import { PunnettPreview } from "@/components/PunnettPreview";
import { SpecimenCard } from "@/components/SpecimenCard";

const METHODS = ["F1", "F2", "F3", "BC1", "LINE", "INBREED", "OUTCROSS"] as const;

function ParentSelect({
  label,
  specimens,
  value,
  onChange,
}: {
  label: string;
  specimens: ApiSpecimen[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-base-500 bg-base-800 px-3 py-2.5 text-ink-100 focus:border-gene-400"
      >
        <option value="">selecionar…</option>
        {specimens.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id} · {s.species} ({s.pack})
          </option>
        ))}
      </select>
    </label>
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
    listSpecimens()
      .then(setSpecimens)
      .catch((e) => setListError(e.message));
  }, []);

  const sire = specimens.find((s) => s.id === sireId);
  const dam = specimens.find((s) => s.id === damId);

  const preview = useMemo(
    () => (sire && dam ? previewCross(sire, dam, specimens) : null),
    [sire, dam, specimens],
  );

  async function onCross() {
    if (!sire || !dam) return;
    setLoading(true);
    setError(null);
    try {
      const res = await postCross({ sireId: sire.id, damId: dam.id, method });
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink-100">
            Laboratório
          </h1>
          <span className="text-sm text-ink-500">GenBreedAI</span>
        </div>
        <div className="gel-rule" />
      </header>

      {listError && (
        <div className="mb-6 rounded-lg border border-danger-400/40 bg-danger-400/10 p-4 text-sm text-danger-400">
          {listError} — a API está no ar em :3001? Rode <code>pnpm --filter @genbreedai/api dev</code>.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bancada de cruzamento */}
        <section className="rounded-2xl border border-base-500 bg-base-700 p-6 shadow-panel">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink-100">Bancada</h2>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <ParentSelect label="Sire" specimens={specimens} value={sireId} onChange={setSireId} />
            <div className="pb-3 text-center font-display text-xl text-gene-400" aria-hidden>
              ×
            </div>
            <ParentSelect label="Dam" specimens={specimens} value={damId} onChange={setDamId} />
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm text-ink-300">Método</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
              className="w-full rounded-lg border border-base-500 bg-base-800 px-3 py-2.5 text-ink-100 focus:border-gene-400"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          {preview && (
            <div className="mt-6">
              <h3 className="mb-3 font-display text-sm font-medium text-gene-400">
                Prévia da prole
              </h3>
              <PunnettPreview preview={preview} />
            </div>
          )}

          <button
            onClick={onCross}
            disabled={!preview?.compatible || loading}
            className="mt-6 w-full rounded-xl bg-gene-400 px-4 py-3 font-display font-semibold text-base-900 transition-colors hover:bg-gene-600 disabled:cursor-not-allowed disabled:bg-base-500 disabled:text-ink-500"
          >
            {loading ? "Cruzando…" : "Confirmar cruzamento"}
          </button>

          {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
        </section>

        {/* Resultado */}
        <section>
          {result ? (
            <SpecimenCard result={result} />
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center rounded-2xl border border-dashed border-base-500 p-6 text-center text-ink-500">
              Selecione dois espécimes, confira a prévia e confirme o cruzamento
              para revelar o filhote.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
