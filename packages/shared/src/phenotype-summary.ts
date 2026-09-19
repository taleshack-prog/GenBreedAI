/**
 * Resumo curto do fenótipo ("Pontos (siamês) · Juba") — usado pela WEB (cards da
 * Laboratório/Incubadora, ADR-0020) e pela API (corpo da notificação "Gestação
 * concluída", ADR-0028). Vive aqui pra os dois falarem EXATAMENTE o mesmo nome,
 * sem cópia que possa divergir. Puro, sem I/O.
 *
 * Regra de ouro (bug corrigido em rodada anterior): NUNCA usar `.includes(palavra)`
 * pra detectar "tem o traço X" — os valores vêm de `phenotypeByAllele`/
 * `heteroPhenotype` dos packs (`packages/engine/src/data/feline.ts`/`canine.ts`), e o
 * valor "ausente"/"não tem" às vezes CONTÉM a palavra do valor "presente" (ex.:
 * "não-merle" contém "merle"). Toda checagem usa igualdade EXATA contra os valores
 * literais que os packs de fato produzem — nunca um rótulo inventado fora deles.
 */
export function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Resumo do fenótipo ciente da família (felino usa P/W; canino usa A/K/B/M/H/S). */
export function phenoSummary(loci: Record<string, string>): string {
  const isCanine = loci.K !== undefined || loci.M !== undefined; // loci exclusivos caninos
  if (isCanine) {
    const parts: string[] = [];
    // BUG corrigido: `.includes("merle")` casava com "não-merle" (contém "merle" como
    // substring!) — todo m/m saía rotulado "Merle". Trocado por igualdade exata contra os
    // valores que o pack (canine.ts) de fato usa pra "tem merle": "merle-duplo" (M/M, letal
    // — ver `lethals`) e "merle" (heteroPhenotype de M/m). A epistasia H-sobre-M (canine.ts,
    // `epistasis`) SOBRESCREVE loci.M pra "arlequim (fundo branco, manchas)" quando H E M
    // estão presentes — checado ANTES do merle.
    if (loci.M === "arlequim (fundo branco, manchas)") parts.push("Arlequim");
    else if (loci.M === "merle-duplo" || loci.M === "merle") parts.push("Merle");
    if (loci.K === "brindle/tigrado") parts.push("Brindle");
    if (loci.A) parts.push(cap(loci.A.split("/")[0]!)); // fulvo/tan-points/não-agouti
    if (loci.B && loci.B !== "preto/roan") parts.push(loci.B.split("/")[0]!); // liver/chocolate
    if (loci.F && loci.F !== "liso") parts.push(loci.F); // ondulado/cacheado
    if (loci.S === "piebald") parts.push("piebald");
    else if (loci.S === "branco residual") parts.push("branco residual");
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
