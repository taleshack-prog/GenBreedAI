"use client";
import { useEffect, useState } from "react";
import { listSpecimens, type ApiSpecimen } from "../../lib/api";
import { CapsuleCard } from "../../components/CapsuleCard";
import { Screen, ComingSoon } from "../../components/Screen";

export default function CrossesPage() {
  const [items, setItems] = useState<ApiSpecimen[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listSpecimens().then(setItems).catch((e) => setErr(e.message)); }, []);
  const hybrids = items.filter((s) => s.method !== "FOUNDER" && s.sireId !== null);
  return (
    <Screen title="Galeria de Cruzamentos" subtitle="Híbridos que você sintetizou">
      {err && <ComingSoon>{err}</ComingSoon>}
      {!err && hybrids.length === 0 ? (
        <ComingSoon>
          Nenhum híbrido ainda. Vá ao <a href="/" className="text-cyan underline">Laboratório</a> e sintetize seu primeiro genoma.
        </ComingSoon>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {hybrids.map((s) => <CapsuleCard key={s.id} specimen={s} />)}
        </div>
      )}
    </Screen>
  );
}
