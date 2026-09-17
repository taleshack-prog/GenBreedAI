"use client";

import { useState } from "react";
import { freezeOption, type OffspringOption } from "../lib/api";
import { cap, phenoSummary, richChips } from "../lib/phenotype-summary";
import { GenotypeToggle } from "./Genome";

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

/**
 * TODOS os loci do fenótipo, com o valor JÁ EXPRESSO pelo pack
 * (`o.phenotype.loci`, calculado por `expressPhenotype()` no motor —
 * nenhum rótulo inventado aqui). Rolável (max-height) se não couber, pra
 * nunca estourar o card em 360px.
 */
function FullPhenotype({ loci }: { loci: Record<string, string> }) {
  const text = Object.entries(loci).map(([locus, value]) => `${locus}: ${value}`).join(" · ");
  return (
    <p className="mt-1 max-h-14 overflow-y-auto rounded border border-white/10 bg-bg-900/40 px-2 py-1 text-left font-mono text-[0.6rem] leading-snug text-ink-muted">
      {text}
    </p>
  );
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
          ? "O retrato de IA é gerado ao sintetizar, sem consumir cota."
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
                        <FullPhenotype loci={phen?.loci ?? o.phenotype.loci} />
                      </div>
                    );
                  })}
                </div>
                {o.variants > 1 && <div className="mt-1 text-center text-[0.55rem] text-ink-muted">{o.variants} variantes de portador</div>}
                <p className="mt-1 text-center text-[0.55rem] text-ink-muted">O sexo é sorteado na síntese.</p>
                {sel && <div className="mt-1 text-center font-display text-[0.65rem] uppercase text-cyan">✓ escolhido</div>}
                {/* Genótipo é o MESMO pros dois sexos (moldura já diz "mesmo
                    genótipo") — 1 toggle só, não duplicado por sub-card. */}
                <GenotypeToggle genotype={o.genotype} />
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
              <FullPhenotype loci={o.phenotype.loci} />
              {o.variants > 1 && <div className="text-center text-[0.55rem] text-ink-muted">{o.variants} variantes de portador</div>}
              {sel && <div className="mt-1 text-center font-display text-[0.65rem] uppercase text-cyan">✓ escolhido</div>}
              <GenotypeToggle genotype={o.genotype} />
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
