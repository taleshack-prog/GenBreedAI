"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listIncubator, gestateEntry, bornEntry, discardEntry, getMyTier, type IncubatorEntry, type IncubatorState, type IncubatorStateCounts, type MyTier } from "../../../lib/api";
import { Screen, ComingSoon } from "../../../components/Screen";
import { displayName } from "../../../lib/display";
import { sexChar } from "../../../components/SexBadge";
import { phenoSummary } from "../../../lib/phenotype-summary";
import { birthQuotaLabel, nextAvailableLabel } from "../../../lib/quota-format";
import { gestationRemainingLabel, incubatorExitLabel } from "../../../lib/gestation";
import { DISCARD_CONFIRM_TEXT, FIRST_GESTATION_DURING_TEXT, gestationPreviewLabel } from "../../../lib/incubator-texts";
import { GenotypeToggle, FullPhenotype, AuraStars } from "../../../components/Genome";
import { FetusPlaceholder } from "../../../components/FetusPlaceholder";

/**
 * Filtro por estado — item 2 desta rodada: aplicado no SERVIDOR (`state` em
 * `listIncubator()`), não mais recortado no cliente. "PRONTO" agora é um
 * estado de verdade que a API já resolve (`IncubatorState`, ver `lib/api.ts`).
 */
type Filtro = "todas" | IncubatorState;
const FILTROS: Array<{ k: Filtro; label: string; countKey: IncubatorState | null }> = [
  { k: "todas", label: "Todas", countKey: null },
  { k: "NA_INCUBADORA", label: "Na incubadora", countKey: "NA_INCUBADORA" },
  { k: "GESTANDO", label: "Gestando", countKey: "GESTANDO" },
  { k: "PRONTO", label: "Pronto", countKey: "PRONTO" },
  { k: "NASCIDO", label: "Nascido", countKey: "NASCIDO" },
];
const PAGE_LIMIT = 24;

export default function IncubatorPage() {
  const [entries, setEntries] = useState<IncubatorEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<IncubatorStateCounts | null>(null);
  const [myTier, setMyTier] = useState<MyTier | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  /** Descarta o que já foi carregado e busca a 1ª página do filtro atual — usado no mount, ao trocar de filtro, e depois de qualquer ação que mude estado (gestar/nascer/descartar). */
  const resetAndLoad = (f: Filtro) => {
    setErr(null);
    listIncubator({ limit: PAGE_LIMIT, state: f === "todas" ? undefined : f })
      .then((page) => { setEntries(page.entries); setNextCursor(page.nextCursor); setCounts(page.counts); })
      .catch((e) => setErr(e.message));
  };
  useEffect(() => { resetAndLoad(filtro); getMyTier().then(setMyTier).catch(() => {}); }, [filtro]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listIncubator({ limit: PAGE_LIMIT, cursor: nextCursor, state: filtro === "todas" ? undefined : filtro });
      setEntries((prev) => [...prev, ...page.entries]);
      setNextCursor(page.nextCursor);
      setCounts(page.counts); // sempre completa, independe da página — atualiza junto por segurança (pode ter mudado desde a 1ª página).
    } catch (e) { setErr((e as Error).message); }
    finally { setLoadingMore(false); }
  }

  // Contador regressivo (texto, dentro do card GESTANDO) — só cosmético
  // agora: qual ESTADO/balde cada entrada pertence é sempre o que o
  // servidor mandou (`e.state`); isto só deixa o "faltam Xh Ymin" fluindo
  // sem precisar rebuscar a cada segundo.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const hasVaga = !!myTier && myTier.birthQuota.used < myTier.birthQuota.limit;

  async function onGestate(id: string) {
    setBusy(id); setMsg(null); setErr(null);
    try { await gestateEntry(id); resetAndLoad(filtro); await getMyTier().then(setMyTier).catch(() => {}); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  }
  async function onBorn(id: string) {
    setBusy(id); setMsg(null);
    try {
      const r = await bornEntry(id);
      resetAndLoad(filtro);
      setMsg(`Nasceu! Espécime ${r.specimen.id.slice(0, 8)}… já está vivo.`);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  }
  async function onDiscard(id: string) {
    if (!window.confirm(DISCARD_CONFIRM_TEXT)) return;
    setBusy(id); setMsg(null);
    try { await discardEntry(id); resetAndLoad(filtro); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  }

  const totalEntries = counts ? counts.NA_INCUBADORA + counts.GESTANDO + counts.PRONTO + counts.NASCIDO : 0;

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
            {f.label}{counts && f.countKey && ` (${counts[f.countKey]})`}
          </button>
        ))}
      </div>

      {msg && <p className="mb-3 text-center text-xs text-cyan">{msg}</p>}
      {err && <ComingSoon>{err}</ComingSoon>}

      {!err && entries.length === 0 ? (
        <ComingSoon>
          {totalEntries === 0 && filtro === "todas"
            ? <>Nenhuma descrição ainda. Vá ao <a href="/app" className="text-cyan underline">Laboratório</a> e cruze — é livre, sem custo.</>
            : "Nenhuma descrição neste filtro."}
        </ComingSoon>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {entries.map((e) => {
              const estado = e.state;
              return (
                <div key={e.id} className="rounded-card border border-cyan/20 bg-bg-800 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-display text-xs font-bold uppercase text-ink">{displayName(e)} {sexChar(e.sex)}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[0.65rem] text-purple">{(e.prob * 100).toFixed(1)}%</span>
                      <AuraStars n={e.aura} />
                    </span>
                  </div>

                  {estado === "NA_INCUBADORA" && (
                    <>
                      <div className="text-center text-[0.7rem] text-ink">{phenoSummary(e.phenotype.loci)}</div>
                      <FullPhenotype loci={e.phenotype.loci} />
                      <GenotypeToggle genotype={e.genotype} />
                      <p className="mt-2 text-center text-[0.6rem] text-ink-muted">{gestationPreviewLabel(e.aura, myTier?.firstGestationAvailable === true)}</p>
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

                  {estado === "GESTANDO" && (
                    <>
                      <div className="relative mx-auto mb-2 grid aspect-square w-full max-w-[180px] place-items-center overflow-hidden rounded bg-bg-900">
                        <FetusPlaceholder className="h-full w-full" />
                      </div>
                      <div className="text-center text-[0.7rem] text-ink">{phenoSummary(e.phenotype.loci)}</div>
                      <div className="mt-1 text-center font-mono text-[0.7rem] text-purple">
                        {e.gestationEndsAt ? gestationRemainingLabel(e.gestationEndsAt, new Date(nowMs)) : "Gestando…"}
                      </div>
                      {e.firstGestation && (
                        <p className="mt-1 text-center text-[0.6rem] text-ink-muted">{FIRST_GESTATION_DURING_TEXT}</p>
                      )}
                    </>
                  )}

                  {estado === "PRONTO" && (
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

                  {estado === "NASCIDO" && (
                    <>
                      <div className="relative mx-auto mb-2 grid aspect-square w-full max-w-[180px] place-items-center overflow-hidden rounded bg-bg-900">
                        {e.imageUrl ? <img src={e.imageUrl} alt={displayName(e)} className="h-full w-full object-cover" /> : <span className="font-mono text-[0.6rem] uppercase text-ink-muted">modo procedural</span>}
                      </div>
                      <Link href={`/app/reveal/${e.bornSpecimenId}`}
                        className="mt-2 block w-full rounded-lg border border-ok/40 py-2 text-center font-display text-[0.65rem] uppercase text-ok transition hover:bg-ok/10">
                        ✓ Ver espécime
                      </Link>
                      {e.expiresAt && (
                        <div className="mt-1.5 text-center text-[0.6rem] text-ink-muted">{incubatorExitLabel(e.expiresAt, new Date(nowMs))}</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {nextCursor && (
            <button onClick={loadMore} disabled={loadingMore}
              className="mt-4 block w-full rounded-lg border border-white/10 py-2.5 text-center font-display text-xs uppercase tracking-wide text-ink-muted transition hover:text-ink disabled:opacity-60">
              {loadingMore ? "carregando…" : "Carregar mais"}
            </button>
          )}
        </>
      )}
    </Screen>
  );
}
