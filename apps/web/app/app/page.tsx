"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listSpecimens, postCross, gestateEntry, getMyTier, classifyCross, type ApiSpecimen, type CrossClassification, type MyTier, type IncubatorDescription } from "../../lib/api";
import { compatibility } from "../../lib/lab";
import { displayName } from "../../lib/display";
import { methodLabel } from "../../lib/method-label";
import { phenoSummary } from "../../lib/phenotype-summary";
import { birthQuotaLabel, nextAvailableLabel } from "../../lib/quota-format";
import { gestationHoursForAura, FIRST_GESTATION_MINUTES } from "../../lib/gestation";
import { FIRST_GESTATION_DURING_TEXT, gestationPreviewLabel } from "../../lib/incubator-texts";
import { CapsuleCard } from "../../components/CapsuleCard";
import { sexChar } from "../../components/SexBadge";
import { FertilizationCore } from "../../components/FertilizationCore";
import { PunnettGridView, InbreedingGauge, CurrencyBar } from "../../components/LabSections";
import { GenotypeToggle, FullPhenotype, AuraStars } from "../../components/Genome";
import { wrightF } from "@genbreedai/engine";

const METHODS = ["F1", "F2", "F3", "BC1", "LINE", "INBREED", "OUTCROSS"] as const;

/**
 * Card de UMA descrição recém-criada na incubadora (ADR-0021) — mesma
 * informação que a incubadora mostra: probabilidade, aura, fenótipo
 * completo, genótipo. Duas ações (item 3): "Gestar" (mesma regra de custo
 * da incubadora, direto daqui) ou "Guardar na incubadora" (não faz nada —
 * a descrição já ESTÁ salva, livre, desde o cruzamento; só leva pra lá).
 */
function CrossResultCard({ e, myTier, router, onGestated }: { e: IncubatorDescription; myTier: MyTier | null; router: ReturnType<typeof useRouter>; onGestated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // ADR-0025: a gestação que acabou de começar foi a 1ª da conta (cortesia de 5 min)?
  const [wasFirst, setWasFirst] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const hasVaga = !!myTier && myTier.birthQuota.used < myTier.birthQuota.limit;
  const hours = gestationHoursForAura(e.aura);

  async function onGestate() {
    setBusy(true); setMsg(null);
    try {
      const g = await gestateEntry(e.id);
      setWasFirst(g.firstGestation === true); setDone(true);
      onGestated(); // os outros cards do cruzamento precisam saber que a cortesia já foi usada
    }
    catch (ex) { setMsg((ex as Error).message); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-ok/30 bg-bg-900/60 p-3 text-center">
        <p className="text-[0.7rem] text-ok">{wasFirst ? `Gestando — ${FIRST_GESTATION_MINUTES} minutos até nascer.` : `Gestando — ${hours}h até nascer.`}</p>
        {wasFirst && <p className="mt-1 text-[0.6rem] text-ink-muted">{FIRST_GESTATION_DURING_TEXT}</p>}
        <button onClick={() => router.push("/app/incubadora")} className="mt-2 block w-full rounded border border-ok/40 py-1.5 text-center font-display text-[0.6rem] uppercase text-ok transition hover:bg-ok/10">
          Acompanhar na Incubadora
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-cyan/25 bg-bg-900/60 p-3 text-left">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-purple">{(e.prob * 100).toFixed(1)}%</span>
        <AuraStars n={e.aura} />
      </div>
      <div className="text-center text-[0.7rem] text-ink">{phenoSummary(e.phenotype.loci)}</div>
      <FullPhenotype loci={e.phenotype.loci} />
      <GenotypeToggle genotype={e.genotype} />
      <p className="mt-2 text-center text-[0.6rem] text-ink-muted">{gestationPreviewLabel(e.aura, myTier?.firstGestationAvailable === true)}</p>
      <button disabled={busy} onClick={onGestate}
        className="mt-1 block w-full rounded border border-ok/40 bg-ok/5 py-1.5 text-center font-display text-[0.65rem] uppercase text-ok transition hover:bg-ok/10 disabled:opacity-60">
        {busy ? "gestando…" : `◈ Gestar — usa 1 ${hasVaga ? "vaga" : "crédito"}`}
      </button>
      <button
        onClick={() => router.push("/app/incubadora")}
        className="mt-1 block w-full rounded border border-cyan/30 py-1.5 text-center font-display text-[0.6rem] uppercase text-cyan transition hover:bg-cyan/10"
      >
        Guardar na incubadora
      </button>
      {msg && <p className="mt-1 text-center text-[0.6rem] text-crit">{msg}</p>}
    </div>
  );
}

function LabInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [myTier, setMyTier] = useState<MyTier | null>(null);
  const [classification, setClassification] = useState<CrossClassification | null>(null);
  // Tier efetivo (TierService, via /api/v1/me/tier) — nunca mais de um seletor local.
  useEffect(() => { getMyTier().then(setMyTier).catch(() => {}); }, []);
  const [specimens, setSpecimens] = useState<ApiSpecimen[]>([]);
  const [sireId, setSireId] = useState("");
  const [damId, setDamId] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("F1");
  const [crossing, setCrossing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // ADR-0023: teto de 200 entradas não gestadas por dono — quando cruzar
  // dispara o descarte das mais antigas pra abrir espaço, avisa aqui (tom
  // neutro, não é erro).
  const [discardNotice, setDiscardNotice] = useState<string | null>(null);
  // ADR-0021: resultado do ÚLTIMO cruzamento (livre, sem custo) — as
  // descrições ficam na tela até o jogador gestar (aqui) ou ir pra
  // incubadora; cruzar de novo troca pelo resultado novo.
  const [crossEntries, setCrossEntries] = useState<IncubatorDescription[]>([]);

  useEffect(() => {
    listSpecimens().then(setSpecimens).catch((e) => { const m = (e as Error).message; if (/401|autentica|Sess/i.test(m)) { router.push("/login"); return; } setListError(m); });
  }, []);

  const sire = specimens.find((s) => s.id === sireId) ?? null;
  const dam = specimens.find((s) => s.id === damId) ?? null;
  // Seletor de pai: só sex "M"; seletor de mãe: só "F". fertility===0 nunca aparece (não reproduz).
  const sireOptions = specimens.filter((s) => s.sex === "M" && s.fertility !== 0);
  const damOptions = specimens.filter((s) => s.sex === "F" && s.fertility !== 0);

  // Nunca deixa sireId/damId apontar pra fora da lista atual (seleção inicial e após refetch).
  // Declarados ANTES do efeito de sincronização por URL (abaixo) para que um
  // `?a=&b=` explícito e válido vença o fallback "primeiro da lista" quando os
  // dois efeitos disparam no mesmo commit (specimens acabou de carregar).
  useEffect(() => {
    if (!sireOptions.some((s) => s.id === sireId)) setSireId(sireOptions[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specimens]);
  useEffect(() => {
    if (!damOptions.some((s) => s.id === damId)) setDamId(damOptions[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specimens]);

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

  // Trocar de par/método esconde o resultado do cruzamento anterior — ele já
  // está salvo na incubadora de qualquer forma, não precisa continuar visível.
  useEffect(() => { setCrossEntries([]); }, [sire?.id, dam?.id, method]);

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
    setCrossing(true);
    setError(null);
    setDiscardNotice(null);
    try {
      const res = await postCross({ sireId: sire.id, damId: dam.id, method });
      setCrossEntries(res.entries);
      if (res.discardedForCap > 0) {
        const n = res.discardedForCap;
        setDiscardNotice(n === 1 ? "1 descrição antiga foi liberada para abrir espaço." : `${n} descrições antigas foram liberadas para abrir espaço.`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCrossing(false);
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
          {sire && <GenotypeToggle genotype={sire.genotype} label="genótipo do pai" />}
          {sireOptions.length > 0 ? (
            <select value={sireId} onChange={(e) => setSireId(e.target.value)} className="mt-2 w-full rounded-lg border border-cyan/30 bg-bg-900 px-3 py-2 text-ink focus:border-cyan">
              <option value="">selecionar Pai ♂…</option>
              {sireOptions.map((s) => <option key={s.id} value={s.id}>{sexChar(s.sex)} {displayName(s)} · {s.id}</option>)}
            </select>
          ) : (
            <p className="mt-2 w-full rounded-lg border border-cyan/30 bg-bg-900 px-3 py-2 text-center text-sm text-ink-muted">Nenhum macho disponível</p>
          )}
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
            {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m, "short")}</option>)}
          </select>
        </div>

        <div>
          <CapsuleCard specimen={dam} slot="B" />
          {dam && <GenotypeToggle genotype={dam.genotype} label="genótipo da mãe" />}
          {damOptions.length > 0 ? (
            <select value={damId} onChange={(e) => setDamId(e.target.value)} className="mt-2 w-full rounded-lg border border-purple/30 bg-bg-900 px-3 py-2 text-ink focus:border-purple">
              <option value="">selecionar Mãe ♀…</option>
              {damOptions.map((s) => <option key={s.id} value={s.id}>{sexChar(s.sex)} {displayName(s)} · {s.id}</option>)}
            </select>
          ) : (
            <p className="mt-2 w-full rounded-lg border border-purple/30 bg-bg-900 px-3 py-2 text-center text-sm text-ink-muted">Nenhuma fêmea disponível</p>
          )}
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

      {/* Botão cruzar — livre, sem custo (ADR-0020) */}
      <button
        onClick={onCross}
        disabled={!compatible || crossing || sireOptions.length === 0 || damOptions.length === 0}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-ok px-4 py-4 font-display text-lg font-black uppercase tracking-wide text-bg-900 shadow-neon-green transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ink-muted disabled:shadow-none"
      >
        {crossing ? "Cruzando…" : "Cruzar"}
      </button>
      <p className="mt-2 text-center text-[0.65rem] uppercase tracking-wide text-ok">Cruzamentos ilimitados, sem custo</p>
      {error && <p className="mt-3 text-center text-sm text-crit">{error}</p>}
      {discardNotice && <p className="mt-3 text-center text-[0.7rem] text-ink-muted">{discardNotice}</p>}

      {/* Resultado do cruzamento (ADR-0021): descrições recém-criadas, ainda
          sem retrato — ficam livres na incubadora até o jogador gestar. */}
      {crossEntries.length > 0 && (
        <section className="mt-6 rounded-card border border-cyan/20 bg-bg-800 p-4">
          <h3 className="mb-1 font-display text-xs font-bold uppercase text-cyan">
            {crossEntries.length} descriç{crossEntries.length === 1 ? "ão" : "ões"} de fenótipo
          </h3>
          <p className="mb-3 text-[0.7rem] text-ink-muted">As descrições ficam na Incubadora, livres, até você gestar.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {crossEntries.map((e) => <CrossResultCard key={e.id} e={e} myTier={myTier} router={router} onGestated={() => { getMyTier().then(setMyTier).catch(() => {}); }} />)}
          </div>
        </section>
      )}

      {myTier && (
        <p className="mt-4 text-center text-[0.7rem] text-ink-muted">
          Nascimentos: {birthQuotaLabel(myTier.birthQuota)}
          {myTier.birthQuota.nextAvailableAt && myTier.birthQuota.used >= myTier.birthQuota.limit && (
            <span className="text-amber"> · {nextAvailableLabel(myTier.birthQuota.nextAvailableAt)}</span>
          )}
        </p>
      )}
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
