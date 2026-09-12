"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listSpecimens, postCross, type ApiSpecimen } from "../lib/api";
import { compatibility } from "../lib/lab";
import { getCrossOptions, synthesizeAndFreeze, recordReferralClick, getTier, classifyCross, type OffspringOption, type CrossClassification } from "../lib/api";
import { PhenotypeSelector } from "../components/PhenotypeSelector";
import { displayName } from "../lib/display";
import { CapsuleCard } from "../components/CapsuleCard";
import { FertilizationCore } from "../components/FertilizationCore";
import { PunnettGridView, InbreedingGauge, HybridPreview, CurrencyBar } from "../components/LabSections";
import { wrightF } from "@genbreedai/engine";

const METHODS = ["F1", "F2", "F3", "BC1", "LINE", "INBREED", "OUTCROSS"] as const;

function LabInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [options, setOptions] = useState<OffspringOption[]>([]);
  const [canChoose, setCanChoose] = useState(false);
  const [maxOptions, setMaxOptions] = useState(6);
  const [choiceKey, setChoiceKey] = useState<string | null>(null);
  const [freezeMsg, setFreezeMsg] = useState<string | null>(null);
  const [freezeRest, setFreezeRest] = useState(true);
  const [describeMode, setDescribeMode] = useState(false);
  const [classification, setClassification] = useState<CrossClassification | null>(null);
  useEffect(() => { setDescribeMode(getTier() === "FREE"); }, []);
  const [specimens, setSpecimens] = useState<ApiSpecimen[]>([]);
  const [sireId, setSireId] = useState("");
  const [damId, setDamId] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("F1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    listSpecimens().then(setSpecimens).catch((e) => { const m = (e as Error).message; if (/401|autentica|Sess/i.test(m)) { router.push("/login"); return; } setListError(m); });
  }, []);

  const sire = specimens.find((s) => s.id === sireId) ?? null;
  const dam = specimens.find((s) => s.id === damId) ?? null;
  useEffect(() => {
    if (sire?.id && dam?.id) {
      classifyCross({ sireId: sire.id, damId: dam.id })
        .then((c) => { setClassification(c); setMethod(c.method as (typeof METHODS)[number]); })
        .catch(() => setClassification(null));
    } else { setClassification(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sireId, damId]);
  useEffect(() => {
    const a = search.get("a"), b = search.get("b");
    if (a && specimens.some((s) => s.id === a)) setSireId(a);
    if (b && specimens.some((s) => s.id === b)) setDamId(b);
  }, [specimens, search]);

  useEffect(() => {
    setChoiceKey(null); setOptions([]);
    if (sire && dam && sire.pack === dam.pack) {
      getCrossOptions({ sireId: sire.id, damId: dam.id, method })
        .then((r) => { setOptions(r.options); setCanChoose(r.canChoose); setMaxOptions(r.maxOptions); })
        .catch(() => setOptions([]));
    }
  }, [sire?.id, dam?.id, method]);

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
      if (canChoose && choiceKey && freezeRest && options.length > 1) {
        const res = await synthesizeAndFreeze({
          sireId: sire.id, damId: dam.id, method, choiceKey,
          freezeKeys: options.map((o) => o.key),
        });
        router.push(`/reveal/${res.specimen.id}`);
        return;
      }
      const res = await postCross({ sireId: sire.id, damId: dam.id, method, choiceKey: choiceKey ?? undefined });
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
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink">Genetic Lab</h1>
          <span className="font-mono text-[0.7rem] text-ink-muted">// síntese genética</span>
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
            {specimens.map((s) => <option key={s.id} value={s.id}>{displayName(s)} · {s.id}</option>)}
          </select>
        </div>

        <div className="flex flex-col items-center gap-3 py-2">
          <FertilizationCore compatibility={compat} />
          {classification && (
            <div className="mb-2 w-full max-w-xs rounded-lg border border-white/10 bg-bg-800/80 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00F0FF" strokeWidth="1.6"><path d="M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 6h10M7 18h10" /></svg>
                <span className="font-mono text-[0.7rem] text-ink-muted">tipo sugerido</span>
                <span className="font-mono text-[0.72rem] font-semibold text-cyan">{classification.method}</span>
              </div>
              <div className="mt-1 text-[0.68rem] leading-snug text-ink-muted">{classification.reason}</div>
              {classification.inbreedingRisk && (
                <div className="mt-1.5 flex items-center gap-1 border-t border-white/5 pt-1.5 text-[0.62rem] text-crit">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                  <span>endogamia · F=<span className="tnum">{classification.kinship.toFixed(3)}</span></span>
                </div>
              )}
            </div>
          )}
          <select value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])} className="w-44 rounded-lg border border-white/10 bg-bg-900 px-2 py-1.5 text-center font-mono text-sm text-ink transition focus:border-cyan focus:outline-none">
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <CapsuleCard specimen={dam} slot="B" />
          <select value={damId} onChange={(e) => setDamId(e.target.value)} className="mt-2 w-full rounded-lg border border-purple/30 bg-bg-900 px-3 py-2 text-ink focus:border-purple">
            <option value="">selecionar progenitor B…</option>
            {specimens.map((s) => <option key={s.id} value={s.id}>{displayName(s)} · {s.id}</option>)}
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

      {/* Seletor de fenótipo (Senior+ escolhe; Free só vê) */}
      {compatible && options.length > 0 && (
        <section className="mt-5">
          <PhenotypeSelector
            options={options} canChoose={canChoose} maxOptions={maxOptions}
            selectedKey={choiceKey} onSelect={setChoiceKey}
            crossInput={{ sireId: sire!.id, damId: dam!.id, method }}
            family={sire!.pack}
            describeMode={describeMode}
            onFrozen={setFreezeMsg}
          />
          {freezeMsg && <p className="mt-2 text-center text-xs text-cyan">{freezeMsg}</p>}
        </section>
      )}

      {/* Congelar os não escolhidos */}
      {canChoose && options.length > 1 && (
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" checked={freezeRest} onChange={(e) => setFreezeRest(e.target.checked)} className="accent-cyan" />
          Congelar os {options.length - 1} fenótipos não escolhidos (−100 cat. cada = −{(options.length - 1) * 100} catalisadores)
        </label>
      )}

      {/* Botão sintetizar */}
      <button
        onClick={onCross}
        disabled={!compatible || loading}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-ok px-4 py-4 font-display text-lg font-black uppercase tracking-wide text-bg-900 shadow-neon-green transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ink-muted disabled:shadow-none"
      >
        {loading ? "Sintetizando…" : canChoose && choiceKey ? "Sintetizar fenótipo escolhido" : "Sintetizar genoma"}
        {compatible && <span className="font-mono text-sm opacity-80">🌿 25.000 · ⬢ 750</span>}
      </button>
      {error && <p className="mt-3 text-center text-sm text-crit">{error}</p>}


    </main>
  );
}

export default function LabPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-4xl px-4 pb-28 pt-5 text-ink-muted">Carregando laboratório…</main>}>
      <LabInner />
    </Suspense>
  );
}
