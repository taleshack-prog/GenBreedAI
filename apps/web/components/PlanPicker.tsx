"use client";
import { useState } from "react";
import { PLANS, GESTATION_NOTE, fmtBRL, type PlanId, type PlanInfo, type PlanInterval } from "../lib/plans";

/**
 * Toggle mensal/anual + os 4 cards de plano. Puramente apresentacional — quem
 * usa decide o que acontece ao escolher um plano via `onSelect` (a landing
 * navega pra /signup?plan=...; o pós-cadastro chama /billing/subscribe direto).
 */
export function PlanPicker({
  onSelect, ctaLabel, initialInterval = "month", busyPlan, currentPlan,
}: {
  onSelect: (plan: PlanId, interval: PlanInterval) => void;
  ctaLabel?: (plan: PlanInfo) => string;
  initialInterval?: PlanInterval;
  busyPlan?: PlanId | null;
  /** Plano vigente do usuário (backend) — marca o card correspondente como "Plano atual" e o desabilita. */
  currentPlan?: PlanId | null;
}) {
  const [interval, setInterval] = useState<PlanInterval>(initialInterval);

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-lg border border-white/10 bg-bg-800 p-1">
          {(["month", "year"] as const).map((k) => (
            <button key={k} onClick={() => setInterval(k)}
              className={`rounded-md px-4 py-2 font-display text-xs font-bold uppercase tracking-wide transition ${interval === k ? "bg-cyan/15 text-cyan" : "text-ink-muted"}`}>
              {k === "month" ? "Mensal" : "Anual · 1 mês grátis"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => {
          const price = interval === "year" && p.year !== null ? p.year : p.month;
          const suffix = p.month === 0 ? "" : interval === "year" ? "/ano" : "/mês";
          const busy = busyPlan === p.id;
          const isCurrent = currentPlan === p.id;
          return (
            <div key={p.id}
              className="flex flex-col rounded-card border bg-bg-800/70 p-5"
              style={{ borderColor: isCurrent ? p.accent : p.featured ? `${p.accent}80` : "rgba(255,255,255,0.1)", boxShadow: p.featured || isCurrent ? `0 0 20px ${p.accent}33` : undefined }}>
              <div className="mb-1 font-display text-xs font-black uppercase tracking-widest" style={{ color: p.accent }}>{p.label}</div>
              <div className="mb-0.5 font-display text-2xl font-black text-ink tnum">{fmtBRL(price)}<span className="text-sm font-medium text-ink-muted">{suffix}</span></div>
              {interval === "year" && p.year !== null ? (
                <div className="mb-3 font-mono text-[0.62rem] text-ok">equivale a 11 meses — 1 mês grátis</div>
              ) : (
                <div className="mb-3" />
              )}
              <ul className="mb-5 flex-1 space-y-2.5 text-[0.72rem] leading-snug text-ink-muted">
                <li><span className="text-ink">{p.crosses}</span></li>
                <li><span className="text-ink">{p.images}</span></li>
                <li>{p.tools}</li>
                <li>{p.pool}</li>
                <li className="text-ink-muted/80">{GESTATION_NOTE}</li>
              </ul>
              <button onClick={() => onSelect(p.id, interval)} disabled={busy || isCurrent}
                className="rounded-lg border py-2.5 text-center font-display text-xs font-bold uppercase tracking-wide transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
                style={{ borderColor: p.accent, color: p.accent, backgroundColor: isCurrent ? `${p.accent}1A` : undefined }}>
                {busy ? "…" : isCurrent ? "Plano atual" : ctaLabel ? ctaLabel(p) : p.id === "FREE" ? "Começar de graça" : "Assinar"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
