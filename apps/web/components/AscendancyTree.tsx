"use client";
import { useRouter } from "next/navigation";
import type { ApiSpecimen } from "../lib/api";
import { displayName } from "../lib/display";

const METHOD_LABEL: Record<string, string> = {
  F1: "F1", F2: "F2", F3: "F3", BC1: "Retrocruza (BC1)",
  LINE: "Linebreeding", INBREED: "Endogamia", OUTCROSS: "Outcross", FOUNDER: "Fundador",
};

/** Árvore de ascendência recuada: o espécime no topo, pais indentados abaixo. */
export function AscendancyTree({ specimen, byId, depth = 0 }: {
  specimen: ApiSpecimen; byId: Map<string, ApiSpecimen>; depth?: number;
}) {
  const router = useRouter();
  const sire = specimen.sireId ? byId.get(specimen.sireId) : null;
  const dam = specimen.damId ? byId.get(specimen.damId) : null;
  const isFounder = !specimen.sireId;
  const f = specimen.fPedigree ?? 0;

  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : 14 }} className={depth === 0 ? "" : "border-l border-white/10 ml-1"}>
      <div
        onClick={() => router.push(`/genome/${specimen.id}`)}
        className="my-1 flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-bg-800 px-3 py-2 transition hover:border-cyan/40"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan/10 font-display text-[0.6rem] font-bold text-cyan">
          G{specimen.generation}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-xs font-bold text-ink">{displayName(specimen)}</div>
          <div className="text-[0.6rem] text-ink-muted">
            {isFounder ? "Fundador" : METHOD_LABEL[specimen.method] ?? specimen.method}
            {!isFounder && <> · F={f.toFixed(3)}</>}
            {f >= 0.125 && !isFounder && <span className="text-crit"> ⚠</span>}
          </div>
        </div>
        <span className="shrink-0 font-mono text-[0.6rem] text-cyan">{"★".repeat(specimen.aura)}</span>
      </div>
      {(sire || dam) && (
        <div>
          {sire && <AscendancyTree specimen={sire} byId={byId} depth={depth + 1} />}
          {dam && <AscendancyTree specimen={dam} byId={byId} depth={depth + 1} />}
        </div>
      )}
    </div>
  );
}
