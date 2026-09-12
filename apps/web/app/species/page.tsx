"use client";
import { useEffect, useState } from "react";
import { listSpecimens, type ApiSpecimen } from "../../lib/api";
import { CapsuleCard } from "../../components/CapsuleCard";
import { Screen, CurrencyChip, ComingSoon } from "../../components/Screen";

export default function SpeciesPage() {
  const [items, setItems] = useState<ApiSpecimen[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [fam, setFam] = useState<"all" | "feline" | "canine">("all");
  useEffect(() => { listSpecimens().then(setItems).catch((e) => setErr(e.message)); }, []);
  const founders = items
    .filter((s) => s.method === "FOUNDER" || s.generation === 0 || s.sireId === null)
    .filter((s) => fam === "all" || s.pack === fam);
  return (
    <Screen title="Galeria de Espécies" subtitle="Linhagens-base disponíveis"
      right={<CurrencyChip label="Catalisadores" value="3.420" color="#00F0FF" />}>
      {err && <ComingSoon>{err} — inicie a API com <code className="font-mono">pnpm dev</code>.</ComingSoon>}
      <div className="mb-4 flex gap-2">
        {([["all","Todos"],["feline","Felinos"],["canine","Canídeos"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFam(k)}
            className={`rounded-lg border px-4 py-1.5 font-display text-xs uppercase transition ${fam === k ? "border-cyan bg-cyan/10 text-cyan" : "border-white/10 text-ink-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {founders.map((s) => <CapsuleCard key={s.id} specimen={s} />)}
      </div>
    </Screen>
  );
}
