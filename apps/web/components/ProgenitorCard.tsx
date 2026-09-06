"use client";

import type { ApiSpecimen } from "../lib/api";
import { Creature } from "./Creature";
import { AuraStars } from "./AuraStars";

/** Formata alelo com sobrescrito (K^br → K^br). */
function fmt(a: string) {
  return a.replace("⟦mutação⟧", "");
}

/**
 * Card de progenitor (mockup Image 2): moldura neon (ciano = A / púrpura = B),
 * sexo, nome, retrato, nível, estrelas, tabela de genótipo real e "ver detalhes".
 */
export function ProgenitorCard({
  specimen,
  slot,
  sex,
}: {
  specimen: ApiSpecimen | null;
  slot: "A" | "B";
  sex: "♂" | "♀";
}) {
  const cyan = slot === "A";
  const accent = cyan ? "text-cyan" : "text-purple";
  const frame = cyan ? "border-cyan/60 shadow-neon-cyan" : "border-purple/60 shadow-neon-purple";

  return (
    <div className={`rounded-card border bg-bg-800 ${specimen ? frame : "border-white/10"} p-3`}>
      <div className="flex items-center justify-between">
        <span className={`font-display text-xs font-bold uppercase ${accent}`}>
          Progenitor {slot}
        </span>
        <span className={`text-lg ${accent}`}>{sex}</span>
      </div>

      {specimen ? (
        <>
          <div className="mt-1 truncate text-center font-display text-sm font-bold uppercase text-ink">
            {specimen.species}
          </div>
          <div className={`relative mt-2 overflow-hidden rounded-lg border ${cyan ? "border-cyan/30" : "border-purple/30"} bg-bg-studio`}>
            <div className="grid aspect-square place-items-center">
              <Creature genotype={specimen.genotype} species={specimen.species} seed={specimen.cacheKey ?? specimen.id} size={150} />
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-bg-900/80 px-2 py-1">
              <span className="font-mono text-[0.65rem] text-ink-muted">GEN {specimen.generation}</span>
              <AuraStars value={specimen.aura} size={12} />
            </div>
          </div>

          {/* Tabela de genótipo (loci reais do motor auditado) */}
          <div className="mt-3 rounded-lg border border-white/10 bg-bg-900/60 p-2">
            <div className="mb-1 text-center font-display text-[0.65rem] font-bold uppercase text-ink-muted">Genótipo</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {Object.entries(specimen.genotype.loci).map(([locus, pair]) => (
                <div key={locus} className="flex justify-between font-mono text-xs">
                  <span className="text-ink-muted">{locus}</span>
                  <span className={accent}>{fmt(pair[0])}/{fmt(pair[1])}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-2 grid aspect-square place-items-center rounded-lg border border-dashed border-white/15 font-display text-xs uppercase tracking-widest text-ink-muted">
          Selecione
        </div>
      )}
    </div>
  );
}
