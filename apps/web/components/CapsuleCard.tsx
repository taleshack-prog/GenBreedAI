"use client";

import type { ApiSpecimen } from "../lib/api";
import { Creature } from "./Creature";

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
  specimen, selected = false, onClick, slot,
}: { specimen: ApiSpecimen | null; selected?: boolean; onClick?: () => void; slot?: "A" | "B" }) {

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
      className={`block w-full rounded-2xl p-3 text-left transition ${neon}`}
      style={{ background: "#0B1420", border: `1px solid ${cor}4D` }}
    >
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
          {specimen && specimen.imageUrl ? (
            <img src={specimen.imageUrl} alt={specimen.species} className="absolute inset-0 h-full w-full object-contain p-1" />
          ) : specimen ? (
            <div className="absolute inset-0 grid place-items-center">
              <div className="w-[86%]"><Creature genotype={specimen.genotype} family={specimen.pack} seed={specimen.cacheKey ?? specimen.id} size={180} /></div>
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
        {specimen.species}
      </div>
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
