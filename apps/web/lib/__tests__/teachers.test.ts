/**
 * `/professores` (ADR-0040): cada número dos roteiros é RECALCULADO no motor, sobre os fundadores reais da API — mudou genótipo
 * de fundador ou regra do motor, a página não pode continuar dizendo o número antigo. Também: os fundadores são gatos
 * domésticos (plano Free), nome e sexo batem com o catálogo, o JSON-LD só declara o que está visível, nenhum "em breve",
 * o roteiro não usa o gene do comprimento do pelo, e a rota é pública e está no sitemap/llms.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { resolveDisplayName } from "@genbreedai/shared";
import { enumerateOffspring, materializeCross, wrightF, FELINE_PACK } from "@genbreedai/engine";
import { founderSeeds } from "../../../api/src/specimens/in-memory.repository";
import { FIRST_GESTATION_MINUTES } from "../gestation";
import {
  LESSONS, TEACHERS_LEAD, TEACHERS_PATH, TEACHERS_URL, buildTeachersJsonLd, outcomeText, teachersFaq, teachersVisibleText, type Lesson,
} from "../teachers";
import { serializeJsonLd } from "../about";
import { llmsText } from "../llms";
import { PUBLIC_ROUTES } from "../public-routes";
import sitemap from "../../app/sitemap";
import { middleware } from "../../middleware";

const web = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const all = founderSeeds();
const founder = (id: string) => {
  const f = all.find((s) => s.id === id);
  if (!f) throw new Error(`fundador inexistente: ${id}`);
  return f;
};
const lesson = (id: string): Lesson => LESSONS.find((l) => l.id === id)!;
const basePedigree = () => {
  const ped: Record<string, { id: string; sire: string | null; dam: string | null }> = {};
  for (const s of all) ped[s.id] = { id: s.id, sire: null, dam: null };
  return ped;
};
const parent = (id: string) => {
  const f = founder(id);
  return { id: f.id, genotype: f.genotype, sex: f.sex!, species: "felis-catus", generation: 0, fertility: 100 } as never;
};
const ctx = () => ({ pack: FELINE_PACK, pedigree: basePedigree() }) as never;
const options = (l: Lesson) => enumerateOffspring(parent(l.sire.id), parent(l.dam.id), ctx(), 6);
/** Mesma conta da incubadora: `(prob * 100).toFixed(1)`. */
const shown = (p: number) => (p * 100).toFixed(1);

describe("fundadores dos roteiros", () => {
  it("existem, são gatos domésticos (plano Free) e nome/sexo batem com o que o jogo mostra", () => {
    for (const l of LESSONS) for (const p of [l.sire, l.dam]) {
      const f = founder(p.id);
      expect(f.species, p.id).toBe("felis-catus");
      expect(f.sex, p.id).toBe(p.sex);
      expect(resolveDisplayName(f.id, f.species), p.id).toBe(p.name);
    }
  });

  it("os genótipos citados no texto são os dos fundadores", () => {
    expect(founder("gato-preto").genotype.loci.A).toEqual(["A", "a"]);
    expect(founder("gato-preto-femea").genotype.loci.A).toEqual(["A", "a"]);
    expect(founder("gato-abissinio-azul").genotype.loci.B).toEqual(["B", "b^l"]);
    expect(founder("gato-abissinio-azul").genotype.loci.D).toEqual(["d", "d"]);
    expect(founder("gato-abissinio-sorrel").genotype.loci.B).toEqual(["b^l", "b^l"]);
    expect(founder("gato-abissinio-sorrel").genotype.loci.D).toEqual(["D", "d"]);
    for (const id of ["gato-abissinio-azul", "gato-abissinio-sorrel"]) expect(founder(id).genotype.loci.Bd).toEqual(["Bd^a", "Bd^d"]);
    expect(founder("gato-tartaruga-macho").genotype.xLoci).toEqual({ O: ["o"] });
    expect(founder("gato-laranja-femea").genotype.xLoci).toEqual({ O: ["O", "O"] });
  });
});

describe("números dos roteiros = motor", () => {
  it("roteiro 1: 75% melanístico e 25% não-melanístico, nada mais", () => {
    const o = options(lesson("portador-oculto"));
    expect(o.map((x) => [x.phenotype.loci.A, shown(x.prob)])).toEqual([["melanístico", "75.0"], ["não-melanístico", "25.0"]]);
    expect(lesson("portador-oculto").outcomes.map((x) => x.pct)).toEqual([75, 25]);
  });

  it("roteiro 2: 4 cores × fundo âmbar a 18,8% e 2 de fundo dourado a 6,3% na lista de 6; as 8 somam 100%", () => {
    const l = lesson("dois-genes");
    const o = options(l);
    expect(o).toHaveLength(6);
    const amber = o.filter((x) => x.phenotype.loci.Bd === "fundo âmbar");
    expect(amber).toHaveLength(4);
    for (const x of amber) expect(shown(x.prob)).toBe("18.8");
    const colours = new Set(amber.map((x) => `${x.phenotype.loci.B}/${x.phenotype.loci.D}`));
    expect(colours).toEqual(new Set(["preto/denso", "preto/diluído", "canela/denso", "canela/diluído"]));
    const golden = o.filter((x) => x.phenotype.loci.Bd === "fundo dourado");
    expect(golden).toHaveLength(2);
    for (const x of golden) expect(shown(x.prob)).toBe("6.3");
    // As duas que a lista corta (a pergunta da discussão): canela com fundo dourado, 6,25% cada.
    const full = enumerateOffspring(parent(l.sire.id), parent(l.dam.id), ctx(), 99);
    expect(full).toHaveLength(8);
    expect(full.reduce((s, x) => s + x.prob, 0)).toBeCloseTo(1, 10);
    const cut = full.filter((x) => !o.some((y) => y.key === x.key));
    expect(cut.map((x) => [x.phenotype.loci.B, x.phenotype.loci.Bd, x.prob])).toEqual([["canela", "fundo dourado", 0.0625], ["canela", "fundo dourado", 0.0625]]);
    expect(l.outcomes.map((x) => x.pct)).toEqual([18.75, 6.25]);
    expect(outcomeText(l, l.outcomes[0]!)).toContain("18,8%");
    expect(outcomeText(l, l.outcomes[1]!)).toContain("6,3%");
  });

  it("roteiro 3: em toda descrição sorteada, fêmea sai mosaico e macho sai laranja (e os dois sexos aparecem)", () => {
    const l = lesson("ligada-ao-x");
    const a = parent(l.sire.id), b = parent(l.dam.id), c = ctx();
    const sexes = new Set<string>();
    for (let r = 0; r < 30; r++) {
      for (const o of enumerateOffspring(a, b, c, 6)) {
        const s = materializeCross(a, b, "F1" as never, `aula${r}|${o.key}`, c, o.genotype).specimen;
        sexes.add(s.sex);
        expect(s.phenotype.loci.O, `${s.sex} ${r}`).toBe(s.sex === "F" ? "mosaico" : "laranja");
      }
    }
    expect(sexes).toEqual(new Set(["M", "F"]));
  });

  it(`roteiro 3: a primeira gestação citada é a da tabela (${FIRST_GESTATION_MINUTES} min)`, () => {
    expect(lesson("ligada-ao-x").discussion).toContain(`${FIRST_GESTATION_MINUTES} minutos`);
  });

  it("roteiro 4: filhote × pai ou × mãe dá F = 0,25; os fundadores do roteiro 3 dão 0", () => {
    const l = lesson("endogamia");
    const ped = basePedigree();
    ped.filhote = { id: "filhote", sire: l.sire.id, dam: l.dam.id };
    expect(wrightF(ped, l.sire.id, "filhote")).toBe(0.25);
    expect(wrightF(ped, "filhote", l.dam.id)).toBe(0.25);
    expect(wrightF(ped, l.sire.id, l.dam.id)).toBe(0);
    expect(l.outcomes.map((x) => x.pct)).toEqual([25, 0]);
    expect(outcomeText(l, l.outcomes[0]!)).toContain("F = 0,25");
    expect(outcomeText(l, l.outcomes[1]!)).toContain("F = 0,00");
  });

  it("roteiro 4: o limiar de fertilidade citado (0,15) é o do motor", () => {
    const src = readFileSync(web("../../packages/engine/src/fertility.ts"), "utf8");
    expect(src).toContain("F_pedigree > 0.15");
    expect(lesson("endogamia").discussion).toContain("F = 0,15");
  });
});

describe("texto e JSON-LD", () => {
  const text = teachersVisibleText();

  it("o JSON-LD é JSON válido e cada pergunta/resposta está no texto visível", () => {
    const parsed = JSON.parse(serializeJsonLd(buildTeachersJsonLd()));
    const faq = parsed["@graph"][0];
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity).toHaveLength(teachersFaq().length);
    for (const q of faq.mainEntity) {
      expect(q.name.endsWith("?")).toBe(true);
      expect(text).toContain(q.name);
      expect(text).toContain(q.acceptedAnswer.text);
    }
    expect(teachersFaq()[0]!.answer).toBe(`Sim. ${TEACHERS_LEAD}`);
  });

  it("nenhuma promessa futura e nenhum roteiro com o gene do comprimento do pelo (modelado ao contrário do gato real)", () => {
    expect(text).not.toMatch(/em breve|pr[oó]xima atualiza|vai permitir/i);
    for (const l of LESSONS) expect(`${l.setup} ${l.prediction} ${l.inGame}`).not.toMatch(/\bFl\b|pelo longo|pelo curto/);
  });

  it("a página só renderiza a partir de lib/teachers.ts", () => {
    const page = readFileSync(web("app/professores/page.tsx"), "utf8");
    expect(page).toContain('from "../../lib/teachers"');
    expect(page).toContain("buildTeachersJsonLd()");
  });
});

describe("rota pública", () => {
  it("está em PUBLIC_ROUTES, no sitemap e no llms.txt", () => {
    expect(PUBLIC_ROUTES).toContain(TEACHERS_PATH);
    expect(sitemap().map((e) => e.url)).toContain(TEACHERS_URL);
    expect(llmsText()).toContain(`(${TEACHERS_URL})`);
  });

  it("o middleware não redireciona /professores", () => {
    const res = middleware(new NextRequest(new URL(TEACHERS_URL)));
    expect(res.headers.get("location")).toBeNull();
  });
});
