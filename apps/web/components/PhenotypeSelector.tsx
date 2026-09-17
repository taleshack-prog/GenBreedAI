"use client";

import { useState } from "react";
import { freezeOption, type OffspringOption } from "../lib/api";

function AuraMini({ n }: { n: number }) {
  return <span className="text-star text-sm">{"★".repeat(n)}<span className="text-white/20">{"★".repeat(5 - n)}</span></span>;
}

/** Selo "Estéril" (ADR-0018) — mesmos tokens de SexBadge/CapsuleCard.tsx:150. */
function SterileBadge({ title }: { title?: string }) {
  return (
    <span title={title} className="ml-1 inline-block shrink-0 rounded-md border border-crit/40 bg-crit/10 px-1.5 py-0.5 font-display text-[0.55rem] normal-case text-crit">
      Estéril
    </span>
  );
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
/** Lista de chips descritivos — usada em todo card de opção (ADR-0019: nenhuma prévia gera imagem). */
function richChips(o: { phenotype: { loci: Record<string, string> }; genotype: { qtl?: Record<string, number> } }): string[] {
  const loci = o.phenotype.loci;
  const chips: string[] = [phenoSummary(loci), porteWord(o.genotype.qtl?.porte)];
  const ears = earsWord(loci); if (ears) chips.push(ears);
  const fur = furWord(loci); if (fur) chips.push(fur);
  return chips;
}

/**
 * Rótulo do traço que difere entre os sexos numa opção sex-dimórfica (ADR-0017):
 * olha os loci de `phen` que têm um valor DIFERENTE em `other` e devolve os
 * descritores desse lado (ex.: "Juba completa" pro M, "Sem juba" pro F).
 * Genérico — não fixa "Ma"/"juba" no código, funciona pra qualquer locus
 * sex-limited futuro.
 */
function sexDiffLabel(phen?: { loci: Record<string, string> }, other?: { loci: Record<string, string> }): string {
  if (!phen || !other) return "";
  const diffs = Object.keys(phen.loci)
    .filter((k) => phen.loci[k] !== other.loci[k])
    .map((k) => cap(phen.loci[k]!));
  return diffs.join(" · ");
}

/**
 * Seletor de fenótipo. Senior/PhD escolhem entre as opções (por
 * probabilidade, aura e características — sem retrato aqui); Free/Junior:
 * só-leitura. O retrato de IA só é gerado ao SINTETIZAR o fenótipo
 * escolhido, já incluído no cruzamento (ADR-0019) — nenhuma prévia consome
 * cota de imagem.
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

  async function freeze(o: OffspringOption, e: React.MouseEvent) {
    e.stopPropagation();
    setFreezing(o.key);
    try {
      await freezeOption({ ...crossInput, choiceKey: o.key });
      onFrozen?.("Fenótipo congelado no Gene Bank (−20 catalisadores). Descongele depois para usar.");
    } catch (err) { onFrozen?.((err as Error).message); } finally { setFreezing(null); }
  }
  // Só seleciona/desseleciona — nenhuma prévia de imagem é gerada aqui (o
  // retrato de IA só nasce ao SINTETIZAR o escolhido, já incluído no
  // cruzamento, ADR-0019).
  function choose(o: OffspringOption) {
    if (!canChoose) return;
    if (selectedKey === o.key) { onSelect(null); return; }
    onSelect(o.key);
  }

  if (options.length === 0) return null;
  return (
    <div className="rounded-card border border-cyan/20 bg-bg-800 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-display text-xs font-bold uppercase text-cyan">
          {canChoose ? `Selecione o fenótipo · top ${Math.min(maxOptions, options.length)}` : "Prévia da prole possível"}
        </h3>
        {canChoose && <span className="text-[0.65rem] uppercase text-ink-muted">toque para escolher</span>}
      </div>
      <p className="mb-3 text-[0.7rem] text-ink-muted">
        {canChoose
          ? "O retrato de IA é gerado ao sintetizar o fenótipo escolhido, sem consumir sua cota."
          : "No seu tier o filhote é sorteado pela probabilidade. Suba para Senior para escolher."}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => {
          const sel = canChoose && selectedKey === o.key;
          const dimorphic = o.sexDimorphic && !describeMode;

          // Opção dimórfica (ADR-0017/0018): dois cards de sexo (sem
          // retrato — só rótulo, probabilidade e selo Estéril, ver bloco
          // abaixo), mesmo tratamento visual (borda, padding) do card não
          // dimórfico, DENTRO de uma moldura comum. `sm:col-span-2`
          // (min-width — vale de 640px em diante, sem precisar repetir em
          // lg:) faz a moldura ocupar 2 colunas do grid externo (=1 linha
          // inteira em sm:, 2 de 3 em lg:) — aí cada card de sexo (grid
          // interno de 2 colunas) fica do MESMO tamanho de um card não
          // dimórfico. Abaixo de 640px (grid externo de 1 coluna só) não há
          // 2 colunas pra ocupar: os dois cards dividem a largura total da
          // moldura — menores que um card não dimórfico nesse breakpoint,
          // mas NUNCA transbordam.
          if (dimorphic) {
            return (
              <div key={o.key}
                className={`rounded-lg border bg-bg-900/30 p-2 sm:col-span-2 ${sel ? "border-cyan ring-2 ring-cyan" : "border-white/10"}`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="font-display text-[0.6rem] uppercase text-ink-muted">Mesmo genótipo · sexo sorteado na síntese</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-purple">{(o.prob * 100).toFixed(1)}%</span>
                    <AuraMini n={o.aura} />
                  </span>
                </div>
                {o.maleSterile && (
                  <p className="mb-2 text-center font-display text-[0.6rem] uppercase text-crit">Machos desta cruza serão estéreis</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {(["M", "F"] as const).map((sex) => {
                    const phen = sex === "M" ? o.phenotypeBySex?.M : o.phenotypeBySex?.F;
                    const other = sex === "M" ? o.phenotypeBySex?.F : o.phenotypeBySex?.M;
                    const label = sexDiffLabel(phen, other) || phenoSummary(phen?.loci ?? o.phenotype.loci);
                    // Sem retrato por sexo aqui (link "ver retrato" removido):
                    // cada card mostra só o rótulo de fenótipo do sexo, a
                    // probabilidade (50/50) e o selo Estéril quando cabe.
                    return (
                      <div key={sex} role="button" tabIndex={0} onClick={() => choose(o)}
                        className={`w-full min-w-0 rounded-lg border bg-bg-900/60 p-2 text-center transition ${sel ? "border-cyan" : "border-white/10"} ${canChoose ? "cursor-pointer hover:border-cyan/60" : "cursor-default"}`}
                      >
                        <div className="mb-1 flex min-w-0 items-center justify-center gap-1">
                          <span className="font-mono text-[0.6rem] text-cyan">{sex === "M" ? "♂ 50%" : "♀ 50%"}</span>
                          {sex === "M" && o.maleSterile && <SterileBadge title="Este macho nasce estéril (ADR-0018)." />}
                        </div>
                        <div className="truncate text-[0.65rem] text-ink" title={label}>{label}</div>
                      </div>
                    );
                  })}
                </div>
                {o.variants > 1 && <div className="mt-1 text-center text-[0.55rem] text-ink-muted">{o.variants} variantes de portador</div>}
                <p className="mt-1 text-center text-[0.55rem] text-ink-muted">O sexo é sorteado na síntese.</p>
                {sel && <div className="mt-1 text-center font-display text-[0.65rem] uppercase text-cyan">✓ escolhido</div>}
                {canChoose && (
                  <span role="button" tabIndex={0} onClick={(e) => freeze(o, e)}
                    className="mt-2 block cursor-pointer rounded border border-cyan/30 py-1 text-center font-display text-[0.6rem] uppercase text-cyan transition hover:bg-cyan/10">
                    {freezing === o.key ? "congelando…" : "❄ congelar (−20)"}
                  </span>
                )}
              </div>
            );
          }

          // Opção NÃO dimórfica (ou dimórfica colapsada em describeMode) — sem mudança de layout.
          return (
          <div key={o.key}>
            <button
              onClick={() => choose(o)}
              disabled={!canChoose}
              className={`w-full rounded-lg border bg-bg-900/60 p-3 text-left transition ${sel ? "border-cyan ring-2 ring-cyan" : "border-white/10"} ${canChoose ? "hover:border-cyan/60" : "cursor-default"}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-purple">{(o.prob * 100).toFixed(1)}%</span>
                <AuraMini n={o.aura} />
              </div>
              {/* Sem retrato aqui (ADR-0019 — a prévia não gera imagem em
                  nenhum card): bloco de características no lugar da imagem,
                  legível em 360px, sem moldura vazia. */}
              <div className="mb-2 flex min-h-[3rem] w-full flex-wrap content-center items-center justify-center gap-1 rounded bg-bg-900 p-2">
                {richChips(o).map((c, i) => (
                  <span key={i} className="rounded-full border border-cyan/30 bg-cyan/5 px-2 py-0.5 text-[0.6rem] text-cyan">{c}</span>
                ))}
              </div>
              <div className="flex items-center justify-center gap-1 text-center text-[0.7rem] text-ink">
                <span>{phenoSummary(o.phenotype.loci)}</span>
                {o.maleSterile && <SterileBadge title="Machos desta cruza nascem estéreis (ADR-0018)." />}
              </div>
              {o.variants > 1 && <div className="text-center text-[0.55rem] text-ink-muted">{o.variants} variantes de portador</div>}
              {sel && <div className="mt-1 text-center font-display text-[0.65rem] uppercase text-cyan">✓ escolhido</div>}
              {canChoose && (
                <span role="button" tabIndex={0} onClick={(e) => freeze(o, e)}
                  className="mt-2 block cursor-pointer rounded border border-cyan/30 py-1 text-center font-display text-[0.6rem] uppercase text-cyan transition hover:bg-cyan/10">
                  {freezing === o.key ? "congelando…" : "❄ congelar (−20)"}
                </span>
              )}
            </button>
          </div>
          );
        })}
      </div>
    </div>
  );
}
