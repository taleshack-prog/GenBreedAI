/**
 * ADR-0022: loco S (malhado branco) canino passa de dominância COMPLETA para
 * INCOMPLETA — S/s^p agora mostra "branco residual" (peito, patas, ponta da
 * cauda), em vez de ficar indistinguível de S/S ("sólido"). s^p/s^p (piebald)
 * e S/S (sólido) não mudam — só o heterozigoto ganha descritor próprio.
 */
import { describe, it, expect } from "vitest";
import { expressPhenotype, punnettPhenotypeLocus, CANINE_PACK } from "../index";

const S_LOCUS = CANINE_PACK.loci.S!;

describe("Loco S canino — dominância INCOMPLETA (ADR-0022)", () => {
  it("S/S → sólido", () => {
    const ph = expressPhenotype({ loci: { S: ["S", "S"] as [string, string] }, qtl: {} }, CANINE_PACK);
    expect(ph.loci.S).toBe("sólido");
  });

  it("S/s^p (heterozigoto) → branco residual (NÃO sólido, NÃO piebald)", () => {
    const ph = expressPhenotype({ loci: { S: ["S", "s^p"] as [string, string] }, qtl: {} }, CANINE_PACK);
    expect(ph.loci.S).toBe("branco residual");
  });

  it("s^p/S (ordem invertida dos alelos) → mesmo resultado — branco residual, insensível à ordem", () => {
    const ph = expressPhenotype({ loci: { S: ["s^p", "S"] as [string, string] }, qtl: {} }, CANINE_PACK);
    expect(ph.loci.S).toBe("branco residual");
  });

  it("s^p/s^p → piebald", () => {
    const ph = expressPhenotype({ loci: { S: ["s^p", "s^p"] as [string, string] }, qtl: {} }, CANINE_PACK);
    expect(ph.loci.S).toBe("piebald");
  });

  it("cruzamento manto (s^p/s^p) × tigrado (S/S) gera 100% dos filhotes com branco residual (todos S/s^p)", () => {
    const manto: [string, string] = ["s^p", "s^p"];
    const tigrado: [string, string] = ["S", "S"];
    const dist = punnettPhenotypeLocus(S_LOCUS, manto, tigrado);
    expect(dist.size).toBe(1);
    expect(dist.get("branco residual")).toBe(1);
  });
});
