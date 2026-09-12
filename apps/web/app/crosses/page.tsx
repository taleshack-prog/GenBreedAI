"use client";
import { useEffect, useMemo, useState } from "react";
import { listSpecimens, type ApiSpecimen } from "../../lib/api";
import { AscendancyTree } from "../../components/AscendancyTree";
import { Screen, ComingSoon } from "../../components/Screen";
import { displayName } from "../../lib/display";

type Fam = "feline" | "canine";

const METHOD_LABEL: Record<string, string> = {
  F1: "F1", F2: "F2", F3: "F3", BC1: "Retrocruza", LINE: "Linebreeding", INBREED: "Endogamia", OUTCROSS: "Outcross",
};

export default function LineagesPage() {
  const [items, setItems] = useState<ApiSpecimen[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [fam, setFam] = useState<Fam>("feline");
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => { listSpecimens().then(setItems).catch((e) => setErr(e.message)); }, []);

  const byId = useMemo(() => new Map(items.map((s) => [s.id, s])), [items]);

  const roots = useMemo(() => {
    const usedAsParent = new Set<string>();
    for (const s of items) { if (s.sireId) usedAsParent.add(s.sireId); if (s.damId) usedAsParent.add(s.damId); }
    return items
      .filter((s) => s.pack === fam)
      .filter((s) => s.method !== "FOUNDER" && s.sireId)
      .filter((s) => !usedAsParent.has(s.id))
      .sort((a, b) => b.generation - a.generation || b.fixationIndex - a.fixationIndex);
  }, [items, fam]);

  // Conta o tamanho da árvore (nº de ancestrais) para o resumo.
  function treeSize(s: ApiSpecimen, depth = 0): number {
    if (depth > 20) return 1;
    const sire = s.sireId ? byId.get(s.sireId) : null;
    const dam = s.damId ? byId.get(s.damId) : null;
    return 1 + (sire ? treeSize(sire, depth + 1) : 0) + (dam ? treeSize(dam, depth + 1) : 0);
  }

  const toggle = (id: string) => setOpen((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOpen = roots.length > 0 && roots.every((r) => open.has(r.id));
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(roots.map((r) => r.id)));

  return (
    <Screen title="Minhas Linhagens" subtitle="Árvore genealógica de cada cruzamento que você criou">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {([["feline","Felinos"],["canine","Canídeos"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setFam(k); setOpen(new Set()); }}
              className={`rounded-lg border px-4 py-1.5 font-mono text-xs uppercase transition ${fam === k ? "border-cyan bg-cyan/10 text-cyan" : "border-white/10 text-ink-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
        {roots.length > 0 && (
          <button onClick={toggleAll} className="font-mono text-[0.7rem] uppercase text-ink-muted transition hover:text-cyan">
            {allOpen ? "recolher tudo" : "expandir tudo"}
          </button>
        )}
      </div>

      {err && <ComingSoon>{err}</ComingSoon>}
      {!err && roots.length === 0 ? (
        <ComingSoon>
          Nenhuma linhagem de {fam === "feline" ? "felinos" : "canídeos"} ainda. Vá ao <a href="/" className="text-cyan underline">Laboratório</a> e sintetize um cruzamento.
        </ComingSoon>
      ) : (
        <div className="space-y-2">
          {roots.map((s) => {
            const isOpen = open.has(s.id);
            const nodes = treeSize(s);
            return (
              <div key={s.id} className="overflow-hidden rounded-lg border border-white/10 bg-bg-800/60">
                {/* Cabeçalho clicável (resumo) */}
                <button onClick={() => toggle(s.id)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-white/[0.03]">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded transition ${isOpen ? "rotate-90 text-cyan" : "text-ink-muted"}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
                  </span>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cyan/10 font-mono text-[0.6rem] font-semibold text-cyan">G{s.generation}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm font-semibold text-ink">{displayName(s)}</div>
                    <div className="font-mono text-[0.62rem] text-ink-muted">
                      {METHOD_LABEL[s.method] ?? s.method} · <span className="tnum">{nodes}</span> ancestrais · F=<span className="tnum">{(s.fPedigree ?? 0).toFixed(3)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[0.6rem] text-star">{"★".repeat(s.aura)}</span>
                </button>
                {/* Árvore (expandida) */}
                {isOpen && (
                  <div className="border-t border-white/5 px-3 py-2">
                    <AscendancyTree specimen={s} byId={byId} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
