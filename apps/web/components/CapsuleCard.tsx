"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getImage, generateImage, type ApiSpecimen } from "../lib/api";
import { displayName, displaySci } from "../lib/display";

/** BarraRaridade (Design System §6): 5 estrelas preenchidas conforme raridade. */
function BarraRaridade({ valor, cor }: { valor: number; cor: string }) {
  return (
    <div className="flex justify-center gap-1" aria-label={`Raridade ${valor}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="20" height="20" viewBox="0 0 24 24"
          style={{ filter: i <= valor ? `drop-shadow(0 0 4px ${cor})` : undefined }}>
          <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9 6.19 20.9l1.1-6.47L2.6 9.85l6.5-.95L12 2.5z"
            fill={i <= valor ? cor : "none"} stroke={cor} strokeOpacity={i <= valor ? 1 : 0.3} strokeWidth="1.5" />
        </svg>
      ))}
    </div>
  );
}


/**
 * CapsulaCriogenica (Design System §2.3 / §5.2 / §6).
 * Card raio 16px, fundo #0B1420, borda 1px cor-do-estado 0.3, box-shadow neon.
 * Cilindro de vidro (backdrop-blur) + líquido criogênico animado + partículas de
 * DNA + slot de imagem PNG do animal. Estados derivam de F (§4/§5.2):
 *   ativa (ciano) · selecionada (púrpura) · alerta F>0.15 (amarelo) · crítica F>0.20 (vermelho).
 */
export function CapsuleCard({
  specimen, selected = false, onClick, slot, showGenome = true,
}: { specimen: ApiSpecimen | null; selected?: boolean; onClick?: () => void; slot?: "A" | "B"; showGenome?: boolean }) {

  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const router = useRouter();

  async function genImage(e: React.MouseEvent, force: boolean) {
    e.stopPropagation();
    if (!specimen) return;
    setGenLoading(true);
    try { const r = await generateImage(specimen.id, force); if (r.imageUrl) setFetchedUrl(r.imageUrl + "?t=" + Date.now()); }
    catch { /* modo procedural / sem chave */ } finally { setGenLoading(false); }
  }
  useEffect(() => {
    let alive = true;
    if (specimen && !specimen.imageUrl) {
      getImage(specimen.id).then((r) => { if (alive && r?.imageUrl) setFetchedUrl(r.imageUrl); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [specimen?.id, specimen?.imageUrl]);
  const aiUrl = specimen?.imageUrl ?? fetchedUrl;

  const critico = !!specimen && specimen.fPedigree > 0.2;
  const alerta = !!specimen && !critico && specimen.fPedigree > 0.15;
  // slot A força ciano, slot B força púrpura; senão estado por F/seleção.
  const cor = slot === "B" ? "#BF00FF" : slot === "A" ? "#00F0FF"
    : critico ? "#FF3B5C" : alerta ? "#FFC107" : selected ? "#BF00FF" : "#00F0FF";
  const neon = slot === "B" ? "neon-purpura" : slot === "A" ? "neon-ciano"
    : critico ? "neon-critico" : alerta ? "neon-alerta" : selected ? "neon-purpura" : "neon-ciano";

  return (
    <button
      onClick={onClick}
      className={`relative block w-full rounded-2xl p-3 text-left transition ${neon}`}
      style={{ background: "#0B1420", border: `1px solid ${cor}4D` }}
    >
      {specimen && showGenome && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); router.push(`/genome/${specimen.id}`); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); router.push(`/genome/${specimen.id}`); } }}
          title="Genoma detalhado"
          className="absolute right-2 top-2 z-20 grid h-7 w-7 cursor-pointer place-items-center rounded-full border bg-bg-900/80 text-sm transition hover:scale-110"
          style={{ borderColor: `${cor}66`, color: cor }}
        >
          🧬
        </span>
      )}
      {/* CÁPSULA */}
      <div className="relative mx-auto aspect-[3/4] w-full">
        {/* base holográfica */}
        <div className="absolute bottom-6 left-1/2 h-14 w-3/4 -translate-x-1/2 rounded-[50%] blur-2xl"
          style={{ background: cor, opacity: 0.5 }} />
        <div className="absolute bottom-7 left-1/2 h-8 w-2/3 -translate-x-1/2 rounded-[50%] border-2"
          style={{ borderColor: cor, opacity: 0.7 }} />

        {/* tampa */}
        <div className="absolute left-1/2 top-1 z-20 flex h-5 w-2/3 -translate-x-1/2 items-center justify-center gap-6 rounded-full border"
          style={{ background: "#0a1622", borderColor: `${cor}88` }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff9a3c]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff9a3c]" />
        </div>

        {/* cilindro de vidro */}
        <div className="absolute inset-x-4 bottom-9 top-4 overflow-hidden rounded-[44px] border"
          style={{ borderColor: `${cor}59` }}>
          {/* líquido criogênico animado */}
          <div className="cryo-fluid absolute inset-0" />
          {/* partículas de DNA */}
          {[18, 38, 58, 78, 30, 66, 88].map((x, i) => (
            <span key={x} className="particle absolute h-1 w-1 rounded-full"
              style={{ left: `${x}%`, bottom: "8%", background: cor, animationDelay: `${i * 0.8}s` }} />
          ))}
          {/* PNG IA (se gerado) → foto; senão retrato PROCEDURAL (tier grátis, TDD §5.2) */}
          {specimen && aiUrl ? (
            <>
              <img src={aiUrl} alt={specimen.species} className="absolute inset-0 h-full w-full object-contain p-1" />
              <span role="button" tabIndex={0} title="Regenerar retrato" onClick={(e) => genImage(e, true)}
                className="absolute bottom-1 right-1 z-20 grid h-6 w-6 cursor-pointer place-items-center rounded-full border bg-bg-900/80 text-[0.7rem] transition hover:scale-110"
                style={{ borderColor: `${cor}66`, color: cor }}>
                {genLoading ? "…" : "↻"}
              </span>
            </>
          ) : specimen ? (
            <div className="absolute inset-0 grid place-items-center">
              <span role="button" tabIndex={0} onClick={(e) => genImage(e, false)}
                className="cursor-pointer rounded-lg border px-3 py-2 text-center transition hover:bg-white/5"
                style={{ borderColor: `${cor}55`, color: cor }}>
                {genLoading ? (
                  <span className="animate-pulse font-mono text-[0.6rem] uppercase tracking-widest">gerando…</span>
                ) : (
                  <>
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="1.3" className="mx-auto"><path d="M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 6h10M7 18h10" /></svg>
                    <span className="mt-1 block font-mono text-[0.55rem] uppercase tracking-widest">gerar retrato IA</span>
                  </>
                )}
              </span>
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <span className="font-display text-sm uppercase tracking-widest" style={{ color: `${cor}99` }}>Selecione</span>
            </div>
          )}
          {/* reflexo do vidro */}
          <div className="pointer-events-none absolute inset-y-0 left-2 w-2 rounded-full bg-white/15 blur-[2px]" />
        </div>
      </div>

      {/* METADADOS (§5.2) */}
      {specimen ? (<>
      <div className="mt-2 text-center font-display text-base font-bold uppercase tracking-wider"
        style={{ color: cor, textShadow: `0 0 8px ${cor}66` }}>
        {displayName(specimen)}
      </div>
      <div className="text-center text-[0.65rem] italic text-ink-muted">{displaySci(specimen)}</div>
      <div className="mx-auto mt-1.5 flex max-w-[220px] overflow-hidden rounded-md border"
        style={{ borderColor: `${cor}40` }}>
        <div className="flex-1 py-1 text-center font-mono text-xs text-ink-muted">GEN {specimen.generation}</div>
        <div className="w-px" style={{ background: `${cor}40` }} />
        <div className="flex-1 py-1 text-center font-mono text-xs text-ink-muted">F: {specimen.fPedigree.toFixed(2)}</div>
      </div>
      <div className="mt-2">
        <BarraRaridade valor={specimen.aura} cor={cor} />
      </div>
      </>) : (
        <div className="mt-2 text-center font-display text-sm uppercase tracking-widest" style={{ color: `${cor}99` }}>
          {slot === "A" ? "Progenitor A" : slot === "B" ? "Progenitor B" : ""}
        </div>
      )}
    </button>
  );
}
