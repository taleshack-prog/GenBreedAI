/**
 * BUG 2 (rótulo curto do fenótipo citava traços não expressos, ex.: "Merle"
 * pra um m/m homozigoto — "não-merle" contém a substring "merle"). Os
 * `loci` abaixo são os valores JÁ EXPRESSOS que `expressPhenotype()`
 * (packages/engine/src/phenotype.ts) produziria pros genótipos descritos —
 * mesmo formato de `OffspringOption.phenotype.loci` que a API entrega.
 */
import { describe, it, expect } from "vitest";
import { phenoSummary, earsWord } from "../phenotype-summary";

describe("phenoSummary — canino (BUG: .includes(\"merle\") casava com \"não-merle\")", () => {
  it("caso real reportado — dogue-manto-macho (A a/a, K k^y/k^y, S s^p/s^p, M m/m) × dogue-tigrado (A A^y/A^y, K K^br/K^br, S S/S, M m/m) → prole A^y/a, K^br/k^y, S/s^p, M m/m — NUNCA exibe 'Merle'", () => {
    const loci = {
      A: "fulvo/sable", // A^y dominante (dominanceRank canine.ts)
      K: "brindle/tigrado", // K^br dominante
      S: "sólido", // S dominante sobre s^p (dominanceRank ["S","s^p"])
      M: "não-merle", // m/m homozigoto
      H: "sem-harlequin", B: "preto/roan", E: "extensão-normal", F: "liso",
    };
    const label = phenoSummary(loci);
    expect(label).not.toContain("Merle");
  });

  it("mesma prole exibe Brindle (K^br) e Fulvo (A^y) juntos — independentes; o pack (canine.ts) NÃO tem regra de epistasia K-sobre-A, só H-sobre-M", () => {
    const loci = {
      A: "fulvo/sable", K: "brindle/tigrado", S: "sólido", M: "não-merle",
      H: "sem-harlequin", B: "preto/roan", E: "extensão-normal", F: "liso",
    };
    const label = phenoSummary(loci);
    expect(label).toContain("Brindle");
    expect(label).toContain("Fulvo");
  });

  it("M/m heterozigoto (heteroPhenotype \"M|m\": \"merle\") exibe 'Merle'", () => {
    const loci = { A: "não-agouti", K: "permite-agouti", S: "sólido", M: "merle", H: "sem-harlequin" };
    expect(phenoSummary(loci)).toContain("Merle");
  });

  it("M/M (\"merle-duplo\" — genótipo letal via `lethals`, mas o RÓTULO ainda é calculado) exibe 'Merle'", () => {
    const loci = { A: "não-agouti", K: "permite-agouti", S: "sólido", M: "merle-duplo", H: "sem-harlequin" };
    expect(phenoSummary(loci)).toContain("Merle");
  });

  it("H presente + M presente → epistasia harlequin-sobre-merle (canine.ts `epistasis`) sobrescreve loci.M para 'arlequim (fundo branco, manchas)': rótulo exibe 'Arlequim', NUNCA 'Merle' junto", () => {
    // expressPhenotype() já entrega loci.M SOBRESCRITO quando a epistasia
    // dispara (phenotype.ts, passo 3) — é esse valor final que phenoSummary
    // recebe. A checagem antiga (`loci.H.includes("arlequim")`) nunca
    // disparava: H usa "portador-harlequin"/"sem-harlequin" (inglês), nunca
    // contém a palavra portuguesa "arlequim".
    const loci = { A: "não-agouti", K: "permite-agouti", S: "sólido", M: "arlequim (fundo branco, manchas)", H: "portador-harlequin" };
    const label = phenoSummary(loci);
    expect(label).toContain("Arlequim");
    expect(label).not.toContain("Merle");
  });

  it("S homozigoto piebald (s^p/s^p) exibe 'piebald'; S/s^p heterozigoto NÃO — S é dominante sobre s^p neste pack (dominanceRank canine.ts: [\"S\",\"s^p\"]), então o heterozigoto some COMO SÓLIDO, não malhado", () => {
    // Nota (BUG 2, item 5 do pedido): "prole S/s^p exibe malhado branco" não
    // é o comportamento correto do motor pra ESTE pack — S/s^p é sólido
    // (dominância completa). Não escrevi esse teste como pedido porque
    // contradiria expressPhenotype() tal como documentado; se a intenção é
    // S/s^p aparentar malhado (dominância incompleta, como em D/E reais),
    // isso é mudança de MOTOR (dominance: "COMPLETE" → outra coisa em
    // canine.ts) e precisa de confirmação antes de qualquer alteração.
    const homoPiebald = { A: "não-agouti", K: "permite-agouti", S: "piebald", M: "não-merle", H: "sem-harlequin" };
    expect(phenoSummary(homoPiebald)).toContain("piebald");

    const heteroSolid = { A: "não-agouti", K: "permite-agouti", S: "sólido", M: "não-merle", H: "sem-harlequin" };
    expect(phenoSummary(heteroSolid)).not.toContain("piebald");
  });
});

describe("earsWord — canino/felino (BUG: .includes(\"eretas\")/\"semi\" colidia entre valores)", () => {
  it("'orelhas semieretas' NÃO vira 'Orelhas eretas' (bug antigo: .includes(\"eretas\") casava as duas)", () => {
    expect(earsWord({ Ec: "orelhas semieretas" })).toBe("Orelhas semieretas");
  });
  it("'orelhas eretas' (puro) continua 'Orelhas eretas'", () => {
    expect(earsWord({ Ec: "orelhas eretas" })).toBe("Orelhas eretas");
  });
  it("'orelhas semicaídas' NÃO vira 'Orelhas semieretas' (bug antigo: .includes(\"semi\") casava as duas)", () => {
    expect(earsWord({ Ec: "orelhas semicaídas" })).toBe("Orelhas semicaídas");
  });
  it("'orelhas caídas' (puro) continua 'Orelhas caídas'", () => {
    expect(earsWord({ Ec: "orelhas caídas" })).toBe("Orelhas caídas");
  });
  it("felino: tufadas/grandes/normais inalterados", () => {
    expect(earsWord({ Ec: "orelhas tufadas (lince)" })).toBe("Orelhas tufadas");
    expect(earsWord({ Ec: "orelhas grandes (serval)" })).toBe("Orelhas grandes");
    expect(earsWord({ Ec: "orelhas normais" })).toBeNull();
  });
});
