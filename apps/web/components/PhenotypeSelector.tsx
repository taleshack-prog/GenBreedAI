"use client";

import { useState } from "react";
import { previewImage, freezeOption, type OffspringOption } from "../lib/api";

function AuraMini({ n }: { n: number }) {
  return <span className="text-star text-sm">{"★".repeat(n)}<span className="text-white/20">{"★".repeat(5 - n)}</span></span>;
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Resumo do fenótipo ciente da família (felino usa P/W; canino usa A/K/B/M/H/S). */
function phenoSummary(loci: Record<string, string>): string {
  const isCanine = loci.K !== undefined || loci.M !== undefined; // loci exclusivos caninos
  if (isCanine) {
    const parts: string[] = [];
    if (loci.M && loci.M.includes("merle")) parts.push("Merle");
    if (loci.H && loci.H.includes("arlequim")) parts.push("Arlequim");
    if (loci.K === "brindle/tigrado") parts.push("Brindle");
    if (loci.A) parts.push(cap(loci.A.split("/")[0]!)); // fulvo/tan-points/não-agouti
    if (loci.B && loci.B !== "preto/roan") parts.push(loci.B.split("/")[0]!); // liver/chocolate
    if (loci.F && loci.F !== "liso") parts.push(loci.F); // ondulado/cacheado
    if (loci.S === "piebald") parts.push("piebald");
    if (loci.E === "creme/vermelho") parts.push("creme");
    return parts.length ? parts.join(" · ") : "Pelagem padrão";
  }
  const parts: string[] = [];
  if (loci.Hr === "pelado (sphynx)") parts.push("Pelado");
  if (loci.W === "branco") parts.push("Branco");
  else {
    if (loci.C === "albino") parts.push("Albino");
    else if (loci.C === "pontos") parts.push("Pontos (siamês)");
    if (loci.A?.startsWith("melan")) parts.push("Melanístico");
    if (loci.P && loci.P !== "branco") parts.push(cap(loci.P));
    if (loci.B && loci.B !== "preto") parts.push(loci.B);
    if (loci.D === "diluído") parts.push("diluído");
  }
  if (loci.Ma === "juba completa") parts.push("Juba");
  else if (loci.Ma === "juba parcial") parts.push("Juba parcial");
  if (loci.Fl === "pelo longo" && loci.Hr !== "pelado (sphynx)") parts.push("Pelo longo");
  if (loci.Ec && loci.Ec.includes("tufadas")) parts.push("Orelhas tufadas");
  else if (loci.Ec && loci.Ec.includes("grandes")) parts.push("Orelhas grandes");
  return parts.length ? parts.join(" · ") : "Fulvo comum";
}


/** Porte a partir do QTL (0..1). */
function porteWord(p?: number): string {
  const v = p ?? 0.5;
  if (v >= 0.85) return "Gigante"; if (v >= 0.65) return "Grande";
  if (v >= 0.45) return "Médio"; if (v >= 0.3) return "Pequeno-médio"; return "Pequeno";
}
/** Orelhas (felino Ec tufadas/grandes; canino Ec eretas/caídas). */
function earsWord(loci: Record<string, string>): string | null {
  const e = loci.Ec;
  if (!e) return null;
  if (e.includes("tufadas")) return "Orelhas tufadas";
  if (e.includes("grandes")) return "Orelhas grandes";
  if (e.includes("eretas")) return "Orelhas eretas";
  if (e.includes("semi")) return "Orelhas semieretas";
  if (e.includes("caídas")) return "Orelhas caídas";
  return null;
}
/** Pelo (felino Fl/Hr; canino Cl/Ct). */
function furWord(loci: Record<string, string>): string | null {
  if (loci.Hr === "pelado (sphynx)") return "Pelado";
  if (loci.Fl === "pelo longo" || loci.Cl === "pelo longo") return "Pelo longo";
  if (loci.Ct === "pelo cacheado") return "Pelo cacheado";
  if (loci.Ct === "pelo áspero") return "Pelo áspero";
  return "Pelo curto";
}
/** Lista de chips descritivos para o Free decidir sem imagem. */
function richChips(o: { phenotype: { loci: Record<string, string> }; genotype: { qtl?: Record<string, number> } }): string[] {
  const loci = o.phenotype.loci;
  const chips: string[] = [phenoSummary(loci), porteWord(o.genotype.qtl?.porte)];
  const ears = earsWord(loci); if (ears) chips.push(ears);
  const fur = furWord(loci); if (fur) chips.push(fur);
  return chips;
}

/**
 * Seletor de fenótipo. Senior/PhD escolhem; ao selecionar, GERA o retrato IA
 * daquela opção (preview) — o jogador vê antes de sintetizar. A foto fica
 * cacheada e reaproveitada na síntese. Free/Junior: só-leitura.
 */
export function PhenotypeSelector({
  options, canChoose, maxOptions, selectedKey, onSelect, crossInput, family, describeMode, onFrozen,
}: {
  options: OffspringOption[]; canChoose: boolean; maxOptions: number;
  selectedKey: string | null; onSelect: (key: string | null) => void;
  crossInput: { sireId: string; damId: string; method: string };
  family: string;
  describeMode?: boolean;
  onFrozen?: (msg: string) => void;
}) {
  const [freezing, setFreezing] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function freeze(o: OffspringOption, e: React.MouseEvent) {
    e.stopPropagation();
    setFreezing(o.key);
    try {
      await freezeOption({ ...crossInput, choiceKey: o.key });
      onFrozen?.("Fenótipo congelado no Gene Bank (−20 catalisadores). Descongele depois para usar.");
    } catch (err) { onFrozen?.((err as Error).message); } finally { setFreezing(null); }
  }
  async function regen(o: OffspringOption, e: React.MouseEvent) {
    e.stopPropagation();
    setLoading(o.key);
    try {
      const r = await previewImage({ ...crossInput, choiceKey: o.key, force: true });
      if (r.imageUrl) setPreviews((p) => ({ ...p, [o.key]: r.imageUrl! + "?t=" + Date.now() }));
    } catch (err) { onFrozen?.((err as Error).message); } finally { setLoading(null); }
  }
  async function choose(o: OffspringOption) {
    if (!canChoose) return;
    if (selectedKey === o.key) { onSelect(null); return; }
    onSelect(o.key);
    if (describeMode) return; // Free: decide pela descrição; imagem só ao sintetizar
    if (!previews[o.key]) {
      setLoading(o.key);
      try {
        const r = await previewImage({ ...crossInput, choiceKey: o.key });
        if (r.imageUrl) setPreviews((p) => ({ ...p, [o.key]: r.imageUrl! }));
      } catch (err) { onFrozen?.((err as Error).message); } finally { setLoading(null); }
    }
  }

  if (options.length === 0) return null;
  return (
    <div className="rounded-card border border-cyan/20 bg-bg-800 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-display text-xs font-bold uppercase text-cyan">
          {canChoose ? `Selecione o fenótipo · top ${Math.min(maxOptions, options.length)}` : "Prévia da prole possível"}
        </h3>
        {canChoose && <span className="text-[0.65rem] uppercase text-ink-muted">{describeMode ? "escolha pela descrição · imagem no final" : "clique para ver o retrato"}</span>}
      </div>
      <p className="mb-3 text-[0.7rem] text-ink-muted">
        {canChoose
          ? (describeMode
              ? "Você tem imagens limitadas: escolha pela DESCRIÇÃO do fenótipo. O retrato é gerado só ao sintetizar o escolhido."
              : "Clique numa opção para gerar o retrato e escolhê-la. Gerar retrato consome sua cota mensal de imagens.")
          : "No seu tier o filhote é sorteado pela probabilidade. Suba para Senior para escolher."}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => {
          const sel = canChoose && selectedKey === o.key;
          return (
            <button
              key={o.key}
              onClick={() => choose(o)}
              disabled={!canChoose}
              className={`rounded-lg border bg-bg-900/60 p-3 text-left transition ${sel ? "border-cyan ring-2 ring-cyan" : "border-white/10"} ${canChoose ? "hover:border-cyan/60" : "cursor-default"}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-purple">{(o.prob * 100).toFixed(1)}%</span>
                <AuraMini n={o.aura} />
              </div>
              <div className="relative mb-2 grid aspect-square w-full place-items-center overflow-hidden rounded bg-bg-900 p-2">
                {describeMode ? (
                  <div className="flex flex-wrap content-center justify-center gap-1">
                    {richChips(o).map((c, i) => (
                      <span key={i} className="rounded-full border border-cyan/30 bg-cyan/5 px-2 py-0.5 text-[0.6rem] text-cyan">{c}</span>
                    ))}
                  </div>
                ) : previews[o.key] ? (
                  <>
                    <img src={previews[o.key]} alt="retrato" className="h-full w-full object-cover" />
                    <span role="button" tabIndex={0} title="Regenerar" onClick={(e) => regen(o, e)}
                      className="absolute bottom-1 right-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full border border-cyan/50 bg-bg-900/80 text-[0.7rem] text-cyan transition hover:scale-110">↻</span>
                  </>
                ) : loading === o.key ? (
                  <span className="animate-pulse font-mono text-[0.6rem] uppercase text-cyan">gerando retrato…</span>
                ) : (
                  <span className="px-2 text-center font-display text-sm font-bold text-ink">{phenoSummary(o.phenotype.loci)}</span>
                )}
              </div>
              <div className="text-center text-[0.7rem] text-ink">{phenoSummary(o.phenotype.loci)}</div>
              {o.variants > 1 && <div className="text-center text-[0.55rem] text-ink-muted">{o.variants} variantes de portador</div>}
              {sel && <div className="mt-1 text-center font-display text-[0.65rem] uppercase text-cyan">✓ escolhido</div>}
              {canChoose && (
                <span role="button" tabIndex={0} onClick={(e) => freeze(o, e)}
                  className="mt-2 block cursor-pointer rounded border border-cyan/30 py-1 text-center font-display text-[0.6rem] uppercase text-cyan transition hover:bg-cyan/10">
                  {freezing === o.key ? "congelando…" : "❄ congelar (−20)"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
