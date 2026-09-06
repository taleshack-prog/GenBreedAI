"use client";

import type { ApiSpecimen } from "../lib/api";
import { Creature } from "./Creature";
import { AuraStars } from "./AuraStars";

/** Cor de borda: status por F (DS §5.2) sobrepõe a cor do slot. */
function statusRing(f: number, slot: "cyan" | "purple") {
  if (f > 0.2) return "border-crit shadow-neon-red";
  if (f > 0.15) return "border-warn shadow-neon-amber";
  return slot === "cyan" ? "border-cyan/60 shadow-neon-cyan" : "border-purple/60 shadow-neon-purple";
}

/**
 * Cápsula criogênica (DS §2.3/§5.2): cilindro de vidro, líquido azul pulsante,
 * partículas de DNA, o animal "flutuando" e os metadados (nome, GEN, F, estrelas).
 */
export function Capsule({
  specimen,
  slot,
  label,
}: {
  specimen: ApiSpecimen | null;
  slot: "cyan" | "purple";
  label: string;
}) {
  const accent = slot === "cyan" ? "text-cyan" : "text-purple";
  const ring = specimen ? statusRing(specimen.fPedigree, slot) : `border-${slot === "cyan" ? "cyan" : "purple"}/30`;

  return (
    <div className={`relative overflow-hidden rounded-card border bg-bg-800 ${ring}`}>
      {/* líquido criogênico ao fundo */}
      <div className="cryo-liquid pointer-events-none absolute inset-x-0 bottom-0 h-3/4" />
      {/* partículas de DNA */}
      <div className="pointer-events-none absolute inset-0">
        {[20, 45, 70, 85].map((x, i) => (
          <span
            key={x}
            className="particle absolute h-1 w-1 rounded-full bg-cyan"
            style={{ left: `${x}%`, bottom: "10%", animationDelay: `${i * 1.1}s` }}
          />
        ))}
      </div>

      <div className="relative p-4">
        <div className={`font-display text-[0.7rem] font-bold uppercase ${accent}`}>{label}</div>

        <div className="mx-auto mt-2 grid aspect-square w-full max-w-[220px] place-items-center">
          {specimen ? (
            <Creature
              genotype={specimen.genotype}
              species={specimen.species}
              seed={specimen.cacheKey ?? specimen.id}
              size={200}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-ink-muted/40 font-display text-sm uppercase tracking-widest text-ink-muted">
              Selecione
            </div>
          )}
        </div>

        {specimen && (
          <div className="mt-2 text-center">
            <div className="font-display text-lg font-bold uppercase text-ink">{specimen.species}</div>
            <div className="mt-0.5 font-mono text-xs text-ink-muted">
              GEN {specimen.generation} · F {specimen.fPedigree.toFixed(2)}
            </div>
            <div className="mt-2 flex justify-center">
              <AuraStars value={specimen.aura} size={16} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
