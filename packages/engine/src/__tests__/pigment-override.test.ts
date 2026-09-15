/**
 * Verificação direta do mecanismo `pigmentOverride` (ADR-0013) via
 * expressPhenotype() — determinístico, sem passar por cross()/RNG. NÃO é o
 * golden tortoiseshell (Etapa 3, com distribuições/N=10.000); é só a
 * checagem de que a resolução O→coatPigment está correta antes de reportar
 * a Etapa 2a como pronta.
 */
import { describe, it, expect } from "vitest";
import { expressPhenotype, FELINE_PACK, CANINE_PACK } from "../index";
import type { Genotype } from "@genbreedai/shared";

function feline(loci: Genotype["loci"], xLoci?: Genotype["xLoci"]): Genotype {
  return { loci, qtl: {}, xLoci };
}

describe("pigmentOverride — locus O ligado ao X (ADR-0013)", () => {
  it("macho hemizigoto O → PHEOMELANIN", () => {
    const g = feline({ P: ["P^m", "P^m"], D: ["D", "D"] }, { O: ["O"] });
    expect(expressPhenotype(g, FELINE_PACK).coatPigment).toBe("PHEOMELANIN");
  });
  it("macho hemizigoto o → EUMELANIN", () => {
    const g = feline({ P: ["P^m", "P^m"], D: ["D", "D"] }, { O: ["o"] });
    expect(expressPhenotype(g, FELINE_PACK).coatPigment).toBe("EUMELANIN");
  });
  it("fêmea O/O → PHEOMELANIN", () => {
    const g = feline({ P: ["P^m", "P^m"], D: ["D", "D"] }, { O: ["O", "O"] });
    expect(expressPhenotype(g, FELINE_PACK).coatPigment).toBe("PHEOMELANIN");
  });
  it("fêmea o/o → EUMELANIN", () => {
    const g = feline({ P: ["P^m", "P^m"], D: ["D", "D"] }, { O: ["o", "o"] });
    expect(expressPhenotype(g, FELINE_PACK).coatPigment).toBe("EUMELANIN");
  });
  it("fêmea O/o → MOSAIC (mosaico, não dominância)", () => {
    const g = feline({ P: ["P^m", "P^m"], D: ["D", "D"] }, { O: ["O", "o"] });
    const ph = expressPhenotype(g, FELINE_PACK);
    expect(ph.coatPigment).toBe("MOSAIC");
    expect(ph.loci.O).toBe("mosaico");
  });

  it("O não mascara P — o padrão continua vindo do loco P", () => {
    const listras = expressPhenotype(feline({ P: ["P^m", "P^m"], D: ["D", "D"] }, { O: ["O"] }), FELINE_PACK);
    expect(listras.loci.P).toBe("listras");
    const rosetas = expressPhenotype(feline({ P: ["P^r", "P^r"], D: ["D", "D"] }, { O: ["O"] }), FELINE_PACK);
    expect(rosetas.loci.P).toBe("rosetas");
  });

  it("d/d dilui o pigmento (pigmentDiluted)", () => {
    const diluido = expressPhenotype(feline({ P: ["P^m", "P^m"], D: ["d", "d"] }, { O: ["O"] }), FELINE_PACK);
    expect(diluido.pigmentDiluted).toBe(true);
    const denso = expressPhenotype(feline({ P: ["P^m", "P^m"], D: ["D", "d"] }, { O: ["O"] }), FELINE_PACK);
    expect(denso.pigmentDiluted).toBe(false);
  });

  it("PHEOMELANIN + padrão uniforme (P^t) → ghostPattern", () => {
    const uniforme = expressPhenotype(feline({ P: ["P^t", "P^t"], D: ["D", "D"] }, { O: ["O"] }), FELINE_PACK);
    expect(uniforme.ghostPattern).toBe(true);
    const listrado = expressPhenotype(feline({ P: ["P^m", "P^m"], D: ["D", "D"] }, { O: ["O"] }), FELINE_PACK);
    expect(listrado.ghostPattern).toBe(false);
  });

  it("EUMELANIN não aciona ghostPattern mesmo com padrão uniforme", () => {
    const g = feline({ P: ["P^t", "P^t"], D: ["D", "D"] }, { O: ["o"] });
    expect(expressPhenotype(g, FELINE_PACK).ghostPattern).toBe(false);
  });

  it("genótipo legado (sem xLoci) — compat retro: coatPigment ausente, resto do fenótipo intocado", () => {
    const g: Genotype = { loci: { A: ["a", "a"], P: ["P^m", "P^m"] }, qtl: {} };
    const ph = expressPhenotype(g, FELINE_PACK);
    expect(ph.coatPigment).toBeUndefined();
    expect(ph.pigmentDiluted).toBeUndefined();
    expect(ph.ghostPattern).toBeUndefined();
    expect(ph.loci.A).toBe("não-melanístico");
    expect(ph.loci.P).toBe("listras");
  });

  it("pack sem xLoci/interactionRules (canino) — nunca aciona a regra", () => {
    const g: Genotype = { loci: { B: ["B", "B"], K: ["k^y", "k^y"], A: ["A^y", "A^y"], E: ["E", "E"], S: ["S", "S"], R: ["r", "r"] }, qtl: {} };
    const ph = expressPhenotype(g, CANINE_PACK);
    expect(ph.coatPigment).toBeUndefined();
  });
});
