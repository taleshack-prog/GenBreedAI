"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { listSpecimens, generateImage, type ApiSpecimen } from "../../../lib/api";
import { CapsuleCard } from "../../../components/CapsuleCard";
import { GenotypeChips } from "../../../components/Genome";
import { rarityOf, phenotypeOf, METHOD_LABEL } from "../../../lib/reveal";
import { speciesInfo } from "@genbreedai/shared";

const QTL_LABEL: Record<string,string> = { porte:"Porte", vigor:"Vigor", beleza:"Beleza", temperamento:"Temperamento", rosetas:"Rosetas" };

function LineageMini({ s, cor }: { s: ApiSpecimen | null; cor: string }) {
  return (
    <div className="flex-1 rounded-lg border bg-bg-800 p-2 text-center" style={{ borderColor: `${cor}40` }}>
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border" style={{ borderColor: cor }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="1.4"><path d="M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 6h10M7 18h10" /></svg>
      </div>
      <div className="mt-1 truncate font-display text-xs font-bold uppercase" style={{ color: cor }}>{s ? speciesInfo(s.species).common : "—"}</div>
    </div>
  );
}

export default function RevealPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [all, setAll] = useState<ApiSpecimen[]>([]);
  const [showGenome, setShowGenome] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgMsg, setImgMsg] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { listSpecimens().then(setAll).catch((e) => setErr(e.message)); }, []);

  const specimen = useMemo(() => all.find((s) => s.id === params.id) ?? null, [all, params.id]);
  const sire = useMemo(() => (specimen ? all.find((s) => s.id === specimen.sireId) ?? null : null), [all, specimen]);
  const dam = useMemo(() => (specimen ? all.find((s) => s.id === specimen.damId) ?? null : null), [all, specimen]);

  if (err) return <main className="mx-auto max-w-xl px-4 pb-28 pt-10"><div className="rounded-card border border-crit/40 bg-crit/10 p-4 text-sm text-crit">{err}</div></main>;
  if (!specimen) return <main className="mx-auto max-w-xl px-4 pb-28 pt-10 text-center text-ink-muted">Carregando híbrido…</main>;

  const rarity = rarityOf(specimen.aura);
  const phen = phenotypeOf(specimen);
  const qtl = specimen.genotype.qtl;
  const mid: Record<string, number> | null = sire && dam ? Object.fromEntries(
    Object.keys(qtl).map((k) => [k, ((sire.genotype.qtl[k] ?? 0) + (dam.genotype.qtl[k] ?? 0)) / 2])
  ) : null;

  return (
    <main className="mx-auto max-w-xl px-4 pb-28 pt-6">
      {/* Raridade */}
      <div className="mb-3 flex justify-center">
        <div className="rounded-md border px-6 py-1.5 font-display text-sm font-bold uppercase tracking-[0.2em]"
          style={{ borderColor: rarity.color, color: rarity.color, boxShadow: `0 0 14px ${rarity.color}66` }}>
          ★ {rarity.label} ★
        </div>
      </div>

      {/* Título */}
      <h1 className="reveal mb-5 text-center font-display text-3xl font-black uppercase leading-tight">
        <span className="text-ink">Híbrido </span>
        <span style={{ color: "#00F0FF", textShadow: "0 0 16px #00F0FF88" }}>Revelado!</span>
      </h1>

      {/* Herói: card-cápsula grande */}
      <div className="mx-auto max-w-xs">
        <CapsuleCard specimen={{ ...specimen, imageUrl: imgUrl ?? specimen.imageUrl }} selected={rarity.tier >= 4} />
      </div>

      {/* Linhagem */}
      <div className="mt-6 rounded-card border border-white/10 bg-bg-800/60 p-3">
        <div className="mb-2 text-center font-display text-[0.65rem] uppercase tracking-[0.25em] text-ink-muted">Linhagem</div>
        <div className="flex items-center gap-3">
          <LineageMini s={sire} cor="#00F0FF" />
          <span className="font-display text-lg text-ink-muted">×</span>
          <LineageMini s={dam} cor="#BF00FF" />
        </div>
        <div className="mt-2 text-center font-mono text-xs text-ink-muted">
          {METHOD_LABEL[specimen.method] ?? specimen.method} · geração {specimen.generation}
        </div>
      </div>

      {/* Ações */}
      <div className="mt-5 space-y-3">
        <button
          onClick={async () => {
            setImgLoading(true); setImgMsg(null);
            try {
              const r = await generateImage(specimen.id);
              if (r.imageUrl) { setImgUrl(r.imageUrl); setImgMsg(`Retrato gerado (${r.model}).`); }
              else setImgMsg("Modo procedural ativo. Defina FAL_KEY no .env da API para retratos fotorrealistas (fal.ai / FLUX).");
            } catch (e) { setImgMsg((e as Error).message); } finally { setImgLoading(false); }
          }}
          disabled={imgLoading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan/40 bg-bg-800 px-4 py-3 font-display text-sm uppercase tracking-wide text-cyan transition hover:bg-cyan/10 disabled:opacity-60">
          {imgLoading ? "Gerando retrato…" : "◈ Gerar Retrato IA (fal.ai / FLUX)"}
        </button>
        {imgMsg && <p className="text-center text-xs text-ink-muted">{imgMsg}</p>}
        <button
          onClick={() => {
            const txt = `Revelei um híbrido ${rarity.label} em GenBreedAI: ${specimen.species}!`;
            if (navigator.share) navigator.share({ title: "GenBreedAI", text: txt }).catch(() => {});
            else alert("Exportação de clipe (15s) chega com o pipeline de mídia. Texto copiado para compartilhar: " + txt);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-ok px-4 py-3.5 font-display font-black uppercase tracking-wide text-bg-900 shadow-neon-green transition hover:brightness-110">
          ▶ Exportar clipe <span className="font-mono text-xs opacity-80">15s</span>
        </button>
        <button onClick={() => setShowGenome((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-cyan/30 bg-bg-800 px-4 py-3 font-display text-sm uppercase tracking-wide text-cyan">
          <span>⌗ Ver Genoma (resumo)</span><span>{showGenome ? "▲" : "▼"}</span>
        </button>
        <a href={`/genome/${specimen.id}`} className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple/40 bg-bg-800 px-4 py-3 font-display text-sm uppercase tracking-wide text-purple transition hover:bg-purple/10">
          🧬 Genoma detalhado (árvore · F · alelos)
        </a>
      </div>

      {/* Genoma */}
      {showGenome && (
        <div className="reveal mt-4 space-y-4 rounded-card border border-cyan/20 bg-bg-800/60 p-4">
          <div>
            <h4 className="mb-2 font-display text-xs font-bold uppercase text-cyan">Fenótipo</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(phen.loci).map(([l, d]) => <span key={l} className="rounded-md bg-bg-900 px-2.5 py-1 text-sm text-ink">{l}: {d}</span>)}
            </div>
          </div>
          <div>
            <h4 className="mb-2 font-display text-xs font-bold uppercase text-cyan">Genótipo</h4>
            <GenotypeChips genotype={specimen.genotype} />
          </div>
          <div>
            <h4 className="mb-2 font-display text-xs font-bold uppercase text-cyan">Atributos (QTL)</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {Object.entries(qtl).map(([k, v]) => {
                const lbl = QTL_LABEL[k] ?? k; const arrow = mid ? (v > (mid[k]??0.5) + 0.01 ? "↑" : v < (mid[k]??0.5) - 0.01 ? "↓" : "=") : "";
                const tone = arrow === "↑" ? "text-ok" : arrow === "↓" ? "text-crit" : "text-ink-muted";
                return (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-xs text-ink-muted"><span>{lbl}</span><span className={`font-mono ${tone}`}>{v.toFixed(2)} {arrow}</span></div>
                    <div className="h-1.5 rounded-full bg-bg-900"><div className="h-full rounded-full bg-purple" style={{ width: `${Math.round(v * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[["F de Wright", specimen.fPedigree.toFixed(2)], ["Índice Fixação", specimen.fixationIndex.toFixed(2)], ["Aura", `${specimen.aura}★`]].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-white/10 bg-bg-900/60 px-3 py-2 text-center">
                <div className="font-mono text-lg text-ink">{v}</div><div className="text-[0.65rem] text-ink-muted">{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => router.push("/")} className="mt-6 w-full rounded-xl border border-white/10 py-3 font-display text-sm uppercase tracking-wide text-ink-muted transition hover:text-ink">
        ← Novo cruzamento
      </button>
    </main>
  );
}
