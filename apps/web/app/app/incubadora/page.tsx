"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listIncubator, revealEntry, bornEntry, freezeEntry, discardEntry, getMyTier, type IncubatorEntry, type MyTier } from "../../../lib/api";
import { Screen, ComingSoon } from "../../../components/Screen";
import { displayName } from "../../../lib/display";
import { sexChar } from "../../../components/SexBadge";
import { phenoSummary } from "../../../lib/phenotype-summary";
import { revealQuotaLabel, nextAvailableLabel } from "../../../lib/quota-format";
import { GenotypeToggle, FullPhenotype, AuraStars } from "../../../components/Genome";

/** 4 estados mutuamente exclusivos (ADR-0020, item 2) — "congelada" já implica revelada, então sai do grupo "revelada". */
type Filtro = "todas" | "nao-revelada" | "revelada" | "congelada" | "nascida";
const FILTROS: Array<{ k: Filtro; label: string }> = [
  { k: "todas", label: "Todas" },
  { k: "nao-revelada", label: "Não revelada" },
  { k: "revelada", label: "Revelada" },
  { k: "congelada", label: "Congelada" },
  { k: "nascida", label: "Nascida" },
];

function estadoDe(e: IncubatorEntry): Exclude<Filtro, "todas"> {
  if (e.born) return "nascida";
  if (e.frozen) return "congelada";
  if (e.revealed) return "revelada";
  return "nao-revelada";
}

export default function IncubatorPage() {
  const [entries, setEntries] = useState<IncubatorEntry[]>([]);
  const [myTier, setMyTier] = useState<MyTier | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = () => listIncubator().then((r) => setEntries([...r].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))).catch((e) => setErr(e.message));
  useEffect(() => { reload(); getMyTier().then(setMyTier).catch(() => {}); }, []);

  const visible = entries.filter((e) => filtro === "todas" || estadoDe(e) === filtro);
  const hasQuota = !!myTier && myTier.revealQuota.used < myTier.revealQuota.limit;

  async function onReveal(id: string) {
    setBusy(id); setMsg(null); setErr(null);
    try { await revealEntry(id); await reload(); await getMyTier().then(setMyTier).catch(() => {}); }
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
  async function onFreeze(id: string) {
    setBusy(id); setMsg(null);
    try { await freezeEntry(id); await reload(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  }
  async function onDiscard(id: string) {
    const ok = window.confirm("Esta descrição revelada será perdida. Você já pagou por ela. Congelar guarda para depois. Descartar mesmo assim?");
    if (!ok) return;
    setBusy(id); setMsg(null);
    try { await discardEntry(id); await reload(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <Screen title="Incubadora" subtitle="Descrições de fenótipo dos seus cruzamentos">
      {myTier && (
        <p className="mb-3 text-center text-[0.65rem] text-ink-muted">
          Revelar: {revealQuotaLabel(myTier.revealQuota)} — {myTier.revealQuota.used} de {myTier.revealQuota.limit} usadas
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
            const estado = estadoDe(e);
            return (
              <div key={e.id} className="rounded-card border border-cyan/20 bg-bg-800 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-display text-xs font-bold uppercase text-ink">{displayName(e)} {sexChar(e.sex)}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[0.65rem] text-purple">{(e.prob * 100).toFixed(1)}%</span>
                    <AuraStars n={e.aura} />
                  </span>
                </div>

                {estado === "nao-revelada" && (
                  <>
                    <div className="text-center text-[0.7rem] text-ink">{phenoSummary(e.phenotype.loci)}</div>
                    <FullPhenotype loci={e.phenotype.loci} />
                    <GenotypeToggle genotype={e.genotype} />
                    <button disabled={busy === e.id} onClick={() => onReveal(e.id)}
                      className="mt-2 block w-full rounded-lg border border-cyan/40 bg-cyan/5 py-2 text-center font-display text-[0.65rem] uppercase text-cyan transition hover:bg-cyan/10 disabled:opacity-60">
                      {busy === e.id ? "revelando…" : `◈ Revelar — usa 1 ${hasQuota ? "da sua cota" : "crédito"}`}
                    </button>
                    {!hasQuota && myTier?.revealQuota.nextAvailableAt && (
                      <p className="mt-1 text-center text-[0.6rem] text-amber">{nextAvailableLabel(myTier.revealQuota.nextAvailableAt)}</p>
                    )}
                  </>
                )}

                {(estado === "revelada" || estado === "congelada") && (
                  <>
                    <div className="relative mx-auto mb-2 grid aspect-square w-full max-w-[180px] place-items-center overflow-hidden rounded bg-bg-900">
                      {e.imageUrl ? <img src={e.imageUrl} alt={displayName(e)} className="h-full w-full object-cover" /> : <span className="font-mono text-[0.6rem] uppercase text-ink-muted">modo procedural</span>}
                    </div>
                    <div className="text-center text-[0.7rem] text-ink">{phenoSummary(e.phenotype.loci)}</div>
                    {estado === "congelada" && <div className="mt-1 text-center font-display text-[0.6rem] uppercase text-purple">❄ congelada</div>}
                    <button disabled={busy === e.id} onClick={() => onBorn(e.id)}
                      className="mt-2 block w-full rounded-lg bg-ok py-2 text-center font-display text-[0.65rem] font-bold uppercase text-bg-900 shadow-neon-green transition hover:brightness-110 disabled:opacity-60">
                      {busy === e.id ? "…" : "Nascer (grátis)"}
                    </button>
                    {estado === "revelada" && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button disabled={busy === e.id} onClick={() => onFreeze(e.id)}
                          className="rounded border border-purple/40 py-1.5 text-center font-display text-[0.6rem] uppercase text-purple transition hover:bg-purple/10 disabled:opacity-60">
                          ❄ Congelar (−20)
                        </button>
                        <button disabled={busy === e.id} onClick={() => onDiscard(e.id)}
                          className="rounded border border-crit/40 py-1.5 text-center font-display text-[0.6rem] uppercase text-crit transition hover:bg-crit/10 disabled:opacity-60">
                          Descartar
                        </button>
                      </div>
                    )}
                  </>
                )}

                {estado === "nascida" && (
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
