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
// `cap` e `phenoSummary` moraram aqui; agora vivem em `packages/shared` (ADR-0028) pra API usar o
// MESMO nome de fenótipo no corpo da notificação "Gestação concluída". Reexportados: nenhum import
// da web (nem os testes) muda.
export { cap, phenoSummary } from "@genbreedai/shared";

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
