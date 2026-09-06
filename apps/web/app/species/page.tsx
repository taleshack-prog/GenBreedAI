"use client";
import { useEffect, useState } from "react";
import { listSpecimens, type ApiSpecimen } from "../../lib/api";
import { CapsuleCard } from "../../components/CapsuleCard";
import { Screen, CurrencyChip, ComingSoon } from "../../components/Screen";

export default function SpeciesPage() {
  const [items, setItems] = useState<ApiSpecimen[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listSpecimens().then(setItems).catch((e) => setErr(e.message)); }, []);
  const founders = items.filter((s) => s.method === "FOUNDER" || s.generation === 0 || s.sireId === null);
  return (
    <Screen title="Galeria de Espécies" subtitle="Linhagens-base disponíveis"
      right={<CurrencyChip label="Catalisadores" value="3.420" color="#00F0FF" />}>
      {err && <ComingSoon>{err} — inicie a API com <code className="font-mono">pnpm dev</code>.</ComingSoon>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {founders.map((s) => <CapsuleCard key={s.id} specimen={s} />)}
      </div>
    </Screen>
  );
}
