/**
 * Rótulos curtos/descritivos do fenótipo — usados nos cards de descrição do
 * Laboratório e da Incubadora (ADR-0020). Módulo `.ts` puro (sem JSX/React)
 * de propósito, pra poder ser testado sem precisar de ambiente de
 * DOM/renderização (`__tests__/phenotype-summary.test.ts`).
 *
 * Regra de ouro (bug corrigido nesta rodada): NUNCA usar `.includes(palavra)`
 * pra detectar "tem o traço X" — os valores aqui vêm de
 * `phenotypeByAllele`/`heteroPhenotype` dos packs (`packages/engine/src/data/
 * feline.ts`/`canine.ts`), e o valor "ausente"/"não tem" às vezes CONTÉM a
 * palavra do valor "presente" como substring (ex.: "não-merle" contém
 * "merle"; "orelhas semieretas" contém "eretas"). Toda checagem abaixo usa
 * igualdade EXATA (`===`/`switch`) contra os valores literais que os packs
 * de fato produzem — nunca um rótulo inventado fora deles.
 */
export function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Resumo do fenótipo ciente da família (felino usa P/W; canino usa A/K/B/M/H/S). */
export function phenoSummary(loci: Record<string, string>): string {
  const isCanine = loci.K !== undefined || loci.M !== undefined; // loci exclusivos caninos
  if (isCanine) {
    const parts: string[] = [];
    // BUG corrigido: `.includes("merle")` casava com "não-merle" (contém
    // "merle" como substring!) — todo m/m saía rotulado "Merle". Trocado
    // por igualdade exata contra os valores que o pack (canine.ts) de fato
    // usa pra "tem merle": "merle-duplo" (M/M, letal — ver `lethals`) e
    // "merle" (heteroPhenotype de M/m). O epistasia H-sobre-M (canine.ts,
    // `epistasis`) SOBRESCREVE loci.M pra "arlequim (fundo branco, manchas)"
    // quando H E M estão presentes — checado ANTES do merle (senão um
    // arlequim, cujo loci.M também não é "não-merle", ganharia "Merle" por
    // engano) e a checagem antiga de loci.H (que buscava "arlequim" na
    // string errada — H usa "portador-harlequin"/"sem-harlequin", em
    // inglês, nunca continha "arlequim") nunca disparava de verdade.
    if (loci.M === "arlequim (fundo branco, manchas)") parts.push("Arlequim");
    else if (loci.M === "merle-duplo" || loci.M === "merle") parts.push("Merle");
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

/**
 * Orelhas (felino Ec tufadas/grandes/normais; canino Ec eretas/semieretas/
 * caídas/semicaídas). Igualdade EXATA contra os valores que os packs (feline.ts/
 * canine.ts) de fato produzem — BUG corrigido: a versão anterior usava
 * `.includes("eretas")`, que casava tanto "orelhas eretas" quanto "orelhas
 * SEMIeretas" (rotulava as duas como "Orelhas eretas"), e `.includes("semi")`
 * casava tanto "semieretas" quanto "semicaídas" (uma mascarava a outra,
 * dependendo da ordem dos ifs).
 */
export function earsWord(loci: Record<string, string>): string | null {
  switch (loci.Ec) {
    case "orelhas tufadas (lince)": return "Orelhas tufadas";
    case "orelhas grandes (serval)": return "Orelhas grandes";
    case "orelhas eretas": return "Orelhas eretas";
    case "orelhas semieretas": return "Orelhas semieretas";
    case "orelhas caídas": return "Orelhas caídas";
    case "orelhas semicaídas": return "Orelhas semicaídas";
    default: return null;
  }
}
