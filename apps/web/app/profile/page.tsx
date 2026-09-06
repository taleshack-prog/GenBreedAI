"use client";
import { useEffect, useState } from "react";
import { listSpecimens, type ApiSpecimen } from "../../lib/api";
import { Screen } from "../../components/Screen";

const TIER = { name: "PHD BREEDER", crossesDay: 10, imgsMonth: 20 };

export default function ProfilePage() {
  const [items, setItems] = useState<ApiSpecimen[]>([]);
  useEffect(() => { listSpecimens().then(setItems).catch(() => {}); }, []);
  const total = items.length;
  const hybrids = items.filter((s) => s.method !== "FOUNDER" && s.sireId !== null).length;
  const stat = (label: string, value: string | number) => (
    <div className="rounded-card border border-cyan/20 bg-bg-800 p-4 text-center">
      <div className="font-display text-2xl font-bold text-cyan">{value}</div>
      <div className="text-[0.7rem] uppercase text-ink-muted">{label}</div>
    </div>
  );
  return (
    <Screen title="Perfil" subtitle="Criador">
      <div className="mb-5 flex items-center gap-4 rounded-card border border-purple/30 bg-bg-800 p-4 neon-purpura">
        <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-purple text-2xl">🧬</div>
        <div>
          <div className="font-display text-lg font-bold uppercase text-ink">Tales Hack</div>
          <div className="text-sm text-purple">{TIER.name}</div>
          <div className="mt-1 text-xs text-ink-muted">{TIER.crossesDay} cruzamentos/dia · {TIER.imgsMonth} imagens IA/mês</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {stat("Espécimes", total)}
        {stat("Híbridos", hybrids)}
        {stat("Streak", "0")}
      </div>
    </Screen>
  );
}
