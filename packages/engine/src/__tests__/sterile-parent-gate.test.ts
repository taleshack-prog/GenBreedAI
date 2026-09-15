/**
 * Gate de fertilidade do parental (ADR-0015, item 4). SÓ gate — não modela
 * probabilidade de concepção (não consome rng). O caso de uso real (fixture
 * antigo do Delta macho F1 com fertility 0 como sire → cross() rejeita) está
 * em hybridization-haldane.test.ts, junto do golden Pumajaguar reescrito
 * (item 5) — aqui só a mecânica isolada do gate.
 */
import { describe, it, expect } from "vitest";
import { cross, enumerateOffspring, materializeCross, SterileParentError, CANINE_PACK, type ParentInput } from "../index";

const ctx = { pack: CANINE_PACK, pedigree: {} };

function sire(fertility?: number): ParentInput {
  return { id: "sire", genotype: { loci: {}, qtl: { porte: 0.5 } }, generation: 0, sex: "M", fertility };
}
function dam(fertility?: number): ParentInput {
  return { id: "dam", genotype: { loci: {}, qtl: { porte: 0.5 } }, generation: 0, sex: "F", fertility };
}

describe("Gate de fertilidade do parental (ADR-0015, item 4)", () => {
  it("sire com fertility===0 → cross() rejeita com SterileParentError", () => {
    expect(() => cross(sire(0), dam(), "F1", "gate-01", ctx)).toThrow(SterileParentError);
    try {
      cross(sire(0), dam(), "F1", "gate-01", ctx);
    } catch (e) {
      expect(e).toBeInstanceOf(SterileParentError);
      expect((e as SterileParentError).role).toBe("sire");
      expect((e as SterileParentError).parentId).toBe("sire");
      expect((e as Error).message).toContain("Espécime estéril não pode reproduzir");
    }
  });

  it("dam com fertility===0 → cross() rejeita com SterileParentError", () => {
    expect(() => cross(sire(), dam(0), "F1", "gate-02", ctx)).toThrow(SterileParentError);
  });

  it("mesmo gate se aplica a enumerateOffspring() e materializeCross()", () => {
    expect(() => enumerateOffspring(sire(0), dam(), ctx)).toThrow(SterileParentError);
    expect(() => materializeCross(sire(), dam(0), "F1", "gate-03", ctx, { loci: {}, qtl: { porte: 0.5 } })).toThrow(SterileParentError);
  });

  it("fertility ausente (undefined) NUNCA bloqueia — não inventa esterilidade sem dado", () => {
    expect(() => cross(sire(), dam(), "F1", "gate-04", ctx)).not.toThrow();
  });

  it("fertility > 0 (mesmo baixo, ex. 5) NUNCA bloqueia — só fertility===0 exato rejeita", () => {
    expect(() => cross(sire(5), dam(12), "F1", "gate-05", ctx)).not.toThrow();
  });
});
