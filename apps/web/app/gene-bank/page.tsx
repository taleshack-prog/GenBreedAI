"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listSpecimens, getWallet, freezeSpecimen, thawSpecimen, type ApiSpecimen, type Wallet } from "../../lib/api";
import { CapsuleCard } from "../../components/CapsuleCard";
import { displayName } from "../../lib/display";

export default function GeneBankPage() {
  const router = useRouter();
  const [specimens, setSpecimens] = useState<ApiSpecimen[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [famFilter, setFamFilter] = useState<"all" | "feline" | "canine">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => listSpecimens().then(setSpecimens).catch((e) => setErr(e.message));
  useEffect(() => { reload(); getWallet().then(setWallet).catch(() => {}); }, []);

  const filtered = specimens.filter((s) => famFilter === "all" || s.pack === famFilter);
  const sortedList = [...filtered].sort((a, b) => (a.status === "FROZEN" ? 1 : 0) - (b.status === "FROZEN" ? 1 : 0) || a.fPedigree - b.fPedigree);
  const nameOf = (id: string) => { const s = specimens.find((x) => x.id === id); return s ? displayName(s) : id; };
  const [a, b] = picks;

  function toggle(s: ApiSpecimen) {
    if (s.status === "FROZEN") { setMsg("Este espécime está congelado — descongele para usar no cruzamento."); return; }
    setPicks((cur) => cur.includes(s.id) ? cur.filter((x) => x !== s.id) : cur.length < 2 ? [...cur, s.id] : [cur[1]!, s.id]);
  }
  async function doFreeze(id: string) {
    setBusy(id); setMsg(null);
    try { const r = await freezeSpecimen(id); setWallet(r.wallet); setMsg("Congelado (−20 catalisadores)."); await reload(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }
  async function doThaw(id: string) {
    setBusy(id); setMsg(null);
    try { const r = await thawSpecimen(id); setWallet(r.wallet); setMsg("Descongelado (−10.000 biomassa). Já pode cruzar."); await reload(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pb-40 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-black uppercase text-ink">Gene Bank</h1>
          <p className="text-[0.7rem] uppercase tracking-widest text-ink-muted">Criopreservação · selecione 2 vivos para cruzar</p>
        </div>
        {wallet && (
          <div className="flex gap-2">
            <div className="rounded-lg border border-cyan/30 bg-bg-800 px-3 py-1.5"><div className="text-[0.6rem] uppercase text-ink-muted">Catalisadores</div><div className="font-mono text-sm text-cyan">{wallet.catalisadores.toLocaleString()}</div></div>
            <div className="rounded-lg border border-ok/30 bg-bg-800 px-3 py-1.5"><div className="text-[0.6rem] uppercase text-ink-muted">Biomassa</div><div className="font-mono text-sm text-ok">{wallet.biomassa.toLocaleString()}</div></div>
          </div>
        )}
      </header>
      <div className="mb-4 flex gap-2">
        {([["all","Todos"],["feline","Felinos"],["canine","Canídeos"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFamFilter(k)}
            className={`rounded-lg border px-4 py-1.5 font-display text-xs uppercase transition ${famFilter === k ? "border-cyan bg-cyan/10 text-cyan" : "border-white/10 text-ink-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      {msg && <p className="mb-3 text-sm text-cyan">{msg}</p>}
      {err && <div className="mb-4 rounded-lg border border-crit/40 bg-crit/10 p-4 text-sm text-crit">{err}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sortedList.map((s) => {
          const idx = picks.indexOf(s.id);
          const frozen = s.status === "FROZEN";
          return (
            <div key={s.id} className="relative">
              {idx >= 0 && (
                <span className="absolute -left-1 -top-1 z-20 grid h-6 w-6 place-items-center rounded-full font-display text-xs font-bold text-bg-900" style={{ background: idx === 0 ? "#00F0FF" : "#BF00FF" }}>{idx === 0 ? "A" : "B"}</span>
              )}
              <div className={frozen ? "pointer-events-auto opacity-80" : ""}>
                <CapsuleCard specimen={s} selected={idx === 1} onClick={() => toggle(s)} />
              </div>
              {frozen && (
                <div className="pointer-events-none absolute inset-0 z-10 grid place-items-start justify-center rounded-2xl bg-cyan/5 pt-4">
                  <span className="rounded-full border border-cyan/50 bg-bg-900/80 px-2 py-0.5 font-display text-[0.6rem] uppercase text-cyan">❄ Congelado</span>
                </div>
              )}
              <button disabled={busy === s.id} onClick={() => frozen ? doThaw(s.id) : doFreeze(s.id)}
                className="mt-1 w-full rounded-lg border py-1.5 font-display text-[0.6rem] uppercase transition disabled:opacity-50"
                style={{ borderColor: frozen ? "#00FF9D66" : "#00F0FF66", color: frozen ? "#00FF9D" : "#00F0FF" }}>
                {busy === s.id ? "…" : frozen ? "☀ Descongelar (−10k bio)" : "❄ Congelar (−20 cat)"}
              </button>
            </div>
          );
        })}
      </div>

      {picks.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-cyan/20 bg-bg-900/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
            <div className="flex flex-1 items-center gap-3 text-sm">
              <span className="rounded border border-cyan/40 px-2 py-1 text-cyan">A: {a ? nameOf(a) : "—"}</span>
              <span className="text-ink-muted">×</span>
              <span className="rounded border border-purple/40 px-2 py-1 text-purple">B: {b ? nameOf(b) : "—"}</span>
            </div>
            <button onClick={() => setPicks([])} className="rounded-lg border border-white/15 px-3 py-2 text-xs uppercase text-ink-muted">Limpar</button>
            <button disabled={picks.length < 2} onClick={() => router.push(`/?a=${a}&b=${b}`)}
              className="rounded-lg bg-ok px-4 py-2 font-display text-sm font-bold uppercase text-bg-900 shadow-neon-green transition hover:brightness-110 disabled:bg-white/10 disabled:text-ink-muted disabled:shadow-none">
              Cruzar →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
