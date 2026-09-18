"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listIncubator, gestateEntry, bornEntry, discardEntry, getMyTier, type IncubatorEntry, type MyTier } from "../../../lib/api";
import { Screen, ComingSoon } from "../../../components/Screen";
import { displayName } from "../../../lib/display";
import { sexChar } from "../../../components/SexBadge";
import { phenoSummary } from "../../../lib/phenotype-summary";
import { birthQuotaLabel, nextAvailableLabel } from "../../../lib/quota-format";
import { gestationRemainingLabel } from "../../../lib/gestation";
import { DISCARD_CONFIRM_TEXT } from "../../../lib/incubator-texts";
import { GenotypeToggle, FullPhenotype, AuraStars } from "../../../components/Genome";
import { FetusPlaceholder } from "../../../components/FetusPlaceholder";

/**
 * Estado de UI (ADR-0021, item 1) — "pronto" é um recorte CLIENT-SIDE de
 * GESTANDO: o servidor só marca NASCIDO quando `/born` é chamado, mas a UI
 * já sabe (comparando `gestationEndsAt` com o relógio local) que o prazo
 * venceu antes disso, e é aí que troca o contador pelo botão "Nascer".
 */
type Filtro = "todas" | "na-incubadora" | "gestando" | "pronto" | "nascido";
const FILTROS: Array<{ k: Filtro; label: string }> = [
  { k: "todas", label: "Todas" },
  { k: "na-incubadora", label: "Na incubadora" },
  { k: "gestando", label: "Gestando" },
  { k: "pronto", label: "Pronto" },
  { k: "nascido", label: "Nascido" },
];

function uiStateOf(e: IncubatorEntry, nowMs: number): Exclude<Filtro, "todas"> {
  if (e.state === "NASCIDO") return "nascido";
  if (e.state === "GESTANDO") {
    if (e.gestationEndsAt && new Date(e.gestationEndsAt).getTime() <= nowMs) return "pronto";
    return "gestando";
  }
  return "na-incubadora";
}

export default function IncubatorPage() {
  const [entries, setEntries] = useState<IncubatorEntry[]>([]);
  const [myTier, setMyTier] = useState<MyTier | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const reload = () => listIncubator().then((r) => setEntries([...r].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))).catch((e) => setErr(e.message));
  useEffect(() => { reload(); getMyTier().then(setMyTier).catch(() => {}); }, []);

  // Contador regressivo (item 1, estado GESTANDO) — 15s é fino o bastante
  // pro rótulo, que só mostra granularidade de minuto.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const visible = entries.filter((e) => filtro === "todas" || uiStateOf(e, nowMs) === filtro);
  const hasVaga = !!myTier && myTier.birthQuota.used < myTier.birthQuota.limit;

  async function onGestate(id: string) {
    setBusy(id); setMsg(null); setErr(null);
    try { await gestateEntry(id); await reload(); await getMyTier().then(setMyTier).catch(() => {}); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  }
  async function onBorn(id: string) {
    setBusy(id); setMsg(null);
    try {
      const r = await bornEntry(id);
      await reload();
      setMsg(`Nasceu! Espécime ${r.specimen.id.slice(0, 8)}… já está vivo.`);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  }
  async function onDiscard(id: string) {
    if (!window.confirm(DISCARD_CONFIRM_TEXT)) return;
    setBusy(id); setMsg(null);
    try {
      await discardEntry(id);
      // Some da lista na hora — sem recarregar a incubadora inteira (item 3).
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <Screen title="Incubadora" subtitle="Descrições de fenótipo dos seus cruzamentos">
      {myTier && (
        <p className="mb-3 text-center text-[0.65rem] text-ink-muted">
          Gestar: {birthQuotaLabel(myTier.birthQuota)} — {myTier.birthQuota.used} de {myTier.birthQuota.limit} usadas
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button key={f.k} onClick={() => setFiltro(f.k)}
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs uppercase transition ${filtro === f.k ? "border-cyan bg-cyan/10 text-cyan" : "border-white/10 text-ink-muted hover:text-ink"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {msg && <p className="mb-3 text-center text-xs text-cyan">{msg}</p>}
      {err && <ComingSoon>{err}</ComingSoon>}

      {!err && visible.length === 0 ? (
        <ComingSoon>
          {entries.length === 0
            ? <>Nenhuma descrição ainda. Vá ao <a href="/app" className="text-cyan underline">Laboratório</a> e cruze — é livre, sem custo.</>
            : "Nenhuma descrição neste filtro."}
        </ComingSoon>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((e) => {
            const estado = uiStateOf(e, nowMs);
            return (
              <div key={e.id} className="rounded-card border border-cyan/20 bg-bg-800 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-display text-xs font-bold uppercase text-ink">{displayName(e)} {sexChar(e.sex)}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[0.65rem] text-purple">{(e.prob * 100).toFixed(1)}%</span>
                    <AuraStars n={e.aura} />
                  </span>
                </div>

                {estado === "na-incubadora" && (
                  <>
                    <div className="text-center text-[0.7rem] text-ink">{phenoSummary(e.phenotype.loci)}</div>
                    <FullPhenotype loci={e.phenotype.loci} />
                    <GenotypeToggle genotype={e.genotype} />
                    <p className="mt-2 text-center text-[0.6rem] text-ink-muted">Gestação: {e.gestationHours}h</p>
                    <button disabled={busy === e.id} onClick={() => onGestate(e.id)}
                      className="mt-1 block w-full rounded-lg border border-ok/40 bg-ok/5 py-2 text-center font-display text-[0.65rem] uppercase text-ok transition hover:bg-ok/10 disabled:opacity-60">
                      {busy === e.id ? "gestando…" : `◈ Gestar — usa 1 ${hasVaga ? "das suas vagas" : "crédito"}`}
                    </button>
                    {!hasVaga && myTier?.birthQuota.nextAvailableAt && (
                      <p className="mt-1 text-center text-[0.6rem] text-amber">{nextAvailableLabel(myTier.birthQuota.nextAvailableAt)}</p>
                    )}
                    <button disabled={busy === e.id} onClick={() => onDiscard(e.id)}
                      className="mt-2 block w-full text-center font-mono text-[0.6rem] text-ink-muted underline decoration-dotted transition hover:text-crit disabled:opacity-60">
                      descartar
                    </button>
                  </>
                )}

                {estado === "gestando" && (
                  <>
                    <div className="relative mx-auto mb-2 grid aspect-square w-full max-w-[180px] place-items-center overflow-hidden rounded bg-bg-900">
                      <FetusPlaceholder className="h-full w-full" />
                    </div>
                    <div className="text-center text-[0.7rem] text-ink">{phenoSummary(e.phenotype.loci)}</div>
                    <div className="mt-1 text-center font-mono text-[0.7rem] text-purple">
                      {e.gestationEndsAt ? gestationRemainingLabel(e.gestationEndsAt, new Date(nowMs)) : "Gestando…"}
                    </div>
                  </>
                )}

                {estado === "pronto" && (
                  <>
                    <div className="relative mx-auto mb-2 grid aspect-square w-full max-w-[180px] place-items-center overflow-hidden rounded bg-bg-900">
                      <FetusPlaceholder className="h-full w-full" />
                    </div>
                    <div className="text-center text-[0.7rem] text-ink">{phenoSummary(e.phenotype.loci)}</div>
                    <div className="mt-1 text-center font-display text-[0.65rem] uppercase text-ok">Pronto para nascer!</div>
                    <button disabled={busy === e.id} onClick={() => onBorn(e.id)}
                      className="mt-2 block w-full rounded-lg bg-ok py-2 text-center font-display text-[0.65rem] font-bold uppercase text-bg-900 shadow-neon-green transition hover:brightness-110 disabled:opacity-60">
                      {busy === e.id ? "…" : "Nascer"}
                    </button>
                  </>
                )}

                {estado === "nascido" && (
                  <>
                    <div className="relative mx-auto mb-2 grid aspect-square w-full max-w-[180px] place-items-center overflow-hidden rounded bg-bg-900">
                      {e.imageUrl ? <img src={e.imageUrl} alt={displayName(e)} className="h-full w-full object-cover" /> : <span className="font-mono text-[0.6rem] uppercase text-ink-muted">modo procedural</span>}
                    </div>
                    <Link href={`/app/reveal/${e.bornSpecimenId}`}
                      className="mt-2 block w-full rounded-lg border border-ok/40 py-2 text-center font-display text-[0.65rem] uppercase text-ok transition hover:bg-ok/10">
                      ✓ Ver espécime
                    </Link>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
