/**
 * Página pública `/o-que-e`: o JSON-LD (FAQPage + SoftwareApplication) é válido e TUDO o que ele declara existe no texto
 * visível; os números vêm de `plans.ts`/do catálogo; nenhum "em breve" nem espécie não implementada; a rota é pública
 * (o middleware não a redireciona). Sem DOM: o texto visível vem de `aboutVisibleText()`, a mesma fonte que a página renderiza
 * (e um teste confere que a página só renderiza a partir dela).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { SPECIES_INFO, BREEDS, DOG_BREEDS } from "@genbreedai/shared";
import { PLANS, fmtBRL } from "../plans";
import {
  ABOUT_BLOG_LINKS, ABOUT_PUBLISHER, ABOUT_DESCRIPTION, ABOUT_LEAD, ABOUT_OG_IMAGE, ABOUT_PATH, ABOUT_URL, aboutFaq, aboutSections, aboutVisibleText,
  buildAboutJsonLd, planLine, serializeJsonLd,
} from "../about";
import { config as middlewareConfig, middleware } from "../../middleware";

const web = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const text = aboutVisibleText();
const graph = buildAboutJsonLd();
interface AppNode {
  name: string; description: string; applicationCategory: string; operatingSystem: string; inLanguage: string;
  publisher: { "@type": string; name: string; url: string };
  featureList: string[]; offers: { "@type": string; name: string; price: string; priceCurrency: string }[];
}
interface FaqNode { mainEntity: { "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }[] }
const app = graph["@graph"].find((n) => n["@type"] === "SoftwareApplication") as unknown as AppNode;
const faqNode = graph["@graph"].find((n) => n["@type"] === "FAQPage") as unknown as FaqNode;

describe("JSON-LD — válido e completo", () => {
  it("serializa em JSON válido, com @context schema.org e os dois tipos, e nunca fecha a tag <script> por engano", () => {
    const raw = serializeJsonLd(graph);
    expect(raw).not.toContain("<");
    const parsed = JSON.parse(raw);
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"].map((n: { "@type": string }) => n["@type"]).sort()).toEqual(["FAQPage", "SoftwareApplication"]);
  });

  it("FAQPage: cada pergunta é uma pergunta de verdade, única, e pergunta + resposta existem NO TEXTO VISÍVEL", () => {
    const faq = aboutFaq();
    expect(faq.length).toBeGreaterThanOrEqual(5);
    expect(faqNode.mainEntity).toHaveLength(faq.length);
    const seen = new Set<string>();
    for (const q of faqNode.mainEntity) {
      expect(q["@type"]).toBe("Question");
      expect(q.name.trim().endsWith("?"), q.name).toBe(true);
      expect(seen.has(q.name), `pergunta repetida: ${q.name}`).toBe(false);
      seen.add(q.name);
      expect(q.acceptedAnswer["@type"]).toBe("Answer");
      expect(q.acceptedAnswer.text.trim().length).toBeGreaterThan(20);
      expect(text, `pergunta ausente do texto: ${q.name}`).toContain(q.name);
      expect(text, `resposta ausente do texto: ${q.name}`).toContain(q.acceptedAnswer.text);
    }
  });

  it("a pergunta central está no FAQ e a resposta abre com 'Sim.'", () => {
    const first = aboutFaq()[0]!;
    expect(first.question).toBe("Existe simulador de genética online?");
    expect(first.answer.startsWith("Sim.")).toBe(true);
  });

  it("SoftwareApplication: nome, descrição, categoria e sistema batem com o texto visível", () => {
    expect(app.name).toBe("GenBreedAI");
    expect(text).toContain(app.name);
    expect(text).toContain(app.description);
    expect(app.description).toBe(ABOUT_LEAD);
    expect(app.applicationCategory).toBe("GameApplication");
    expect(text).toContain("jogável"); // categoria: jogo
    expect(app.operatingSystem).toBe("Web");
    expect(text).toContain("no navegador"); // sistema: web
    expect(app.inLanguage).toBe("pt-BR");
  });

  it("publisher: Organization 'Hack Tech Farm' com a URL do site, e o nome aparece no texto visível (linha 'Publicado por')", () => {
    expect(app.publisher).toEqual({ "@type": "Organization", name: "Hack Tech Farm", url: "https://hacktechfarm.com.br/" });
    expect(ABOUT_PUBLISHER).toEqual({ name: app.publisher.name, url: app.publisher.url });
    expect(text).toContain(`Publicado por ${app.publisher.name}`);
    expect(readFileSync(web("app/o-que-e/page.tsx"), "utf8")).toContain("href={ABOUT_PUBLISHER.url}");
  });

  it("featureList: cada item é um subtítulo do bloco 'O que calcula de verdade' e aparece no texto", () => {
    const list = app.featureList;
    expect(list).toHaveLength(10);
    for (const f of list) expect(text, f).toContain(f);
  });

  it("offers: 1 gratuito + mensal e anual dos 3 pagos; cada preço declarado aparece no texto no formato de fmtBRL, vindo de plans.ts", () => {
    const offers = app.offers;
    expect(offers).toHaveLength(1 + 2 * (PLANS.length - 1));
    for (const o of offers) {
      expect(o["@type"]).toBe("Offer");
      expect(o.priceCurrency).toBe("BRL");
      expect(text, `${o.name}: ${fmtBRL(Number(o.price))}`).toContain(fmtBRL(Number(o.price)));
    }
    for (const p of PLANS) {
      expect(text).toContain(p.label);
      expect(text).toContain(planLine(p));
      const mine = offers.filter((o) => o.name.startsWith(p.label));
      if (p.month === 0) expect(mine.map((o) => o.price)).toEqual(["0"]);
      else expect(mine.map((o) => o.price)).toEqual([p.month.toFixed(2), (p.year as number).toFixed(2)]);
    }
  });
});

describe("fatos — números vindos do código, nada digitado", () => {
  it("o anual de todo plano pago = 11 × mensal (é o que o texto 'equivale a 11 meses' afirma)", () => {
    for (const p of PLANS.filter((x) => x.month > 0)) expect((p.year as number).toFixed(2)).toBe((p.month * 11).toFixed(2));
    expect(text).toContain("11 meses");
  });

  it("cada plano traz o limite de nascimentos e os cruzamentos ilimitados de plans.ts", () => {
    for (const p of PLANS) { expect(text).toContain(p.images); expect(text).toContain(p.crosses); }
  });

  it("espécies: todos os felinos selvagens do catálogo, a contagem de raças de gato e de cão, e o pool do PhD", () => {
    for (const s of Object.values(SPECIES_INFO).filter((x) => x.poolGroup === "WILD_FELINE")) expect(text, s.common).toContain(s.common);
    expect(text).toContain(`${Object.keys(BREEDS).length} raças`);
    expect(text).toContain(`${Object.keys(DOG_BREEDS).length} raças`);
    expect(text).toContain(PLANS.find((p) => p.id === "PHD")!.pool);
    expect(text).toContain("Felis catus");
  });

  it("nada de 'em breve' nem de espécie/recurso não implementado (bovinos, equinos, suínos, ovinos, mercado, chat)", () => {
    const low = text.toLowerCase();
    for (const banned of ["em breve", "bovin", "equin", "cavalo", "suíno", "suino", "ovino", "mercado", "leilão", "chat", "nft"]) {
      expect(low, banned).not.toContain(banned);
    }
  });
});

describe("estrutura e blocos curtos", () => {
  it("a primeira frase da página responde a pergunta (sem introdução) e é a do JSON-LD e da meta description", () => {
    const first = aboutSections()[0]!;
    expect(first.paragraphs![0]).toBe(ABOUT_LEAD);
    expect(ABOUT_LEAD).toMatch(/^O GenBreedAI é um simulador de genética animal jogável/);
    expect(ABOUT_DESCRIPTION.startsWith(ABOUT_LEAD)).toBe(true);
    expect(ABOUT_DESCRIPTION.length).toBeLessThanOrEqual(200);
  });

  it("os 7 blocos na ordem pedida, cada um com subtítulo", () => {
    expect(aboutSections().map((s) => s.id)).toEqual(
      ["o-que-e", "para-quem-serve", "especies", "calcula", "nao-e-bichinho-virtual", "preco", "na-pratica"],
    );
    for (const s of aboutSections()) expect(s.heading.trim().length).toBeGreaterThan(3);
  });

  it("'O que calcula de verdade': as 10 capacidades pedidas, uma linha cada", () => {
    const items = aboutSections().find((s) => s.id === "calcula")!.items!;
    expect(items.map((i) => i.title)).toEqual([
      "Dominância completa", "Dominância incompleta", "Codominância", "Epistasia", "Herança ligada ao sexo", "Letais em homozigose",
      "Coeficiente de Wright", "Fertilidade pela regra de Haldane", "Efeito materno", "QTL com herdabilidade",
    ]);
    for (const i of items) expect(i.text.length, i.title).toBeLessThanOrEqual(220);
  });

  it("blocos curtos: nenhum parágrafo ou item passa de 320 caracteres", () => {
    for (const s of aboutSections()) {
      for (const p of s.paragraphs ?? []) expect(p.length, p.slice(0, 40)).toBeLessThanOrEqual(320);
      for (const i of s.items ?? []) expect(i.text.length, i.title ?? i.text.slice(0, 40)).toBeLessThanOrEqual(320);
    }
  });

  it("a página diz que a semente do motor é determinística e que o plano não muda a probabilidade", () => {
    expect(text).toContain("mesma semente");
    expect(text).toContain("nunca o resultado genético");
    expect(text).toContain("nem recebe o plano");
  });
});

describe("página, metadata e rota pública", () => {
  const page = readFileSync(web("app/o-que-e/page.tsx"), "utf8");

  it("a página renderiza SÓ a partir de lib/about (nada de fato ou preço digitado nela), é server component e injeta o JSON-LD", () => {
    expect(page).not.toMatch(/^\s*["']use client["']/m);
    expect(page).toContain("aboutSections()");
    expect(page).toContain("aboutFaq()");
    expect(page).toContain("buildAboutJsonLd()");
    expect(page).toContain('type="application/ld+json"');
    expect(page).not.toMatch(/R\$\s?\d/);
  });

  it("metadata: title, description, canonical e Open Graph (com a imagem que já existe em public/)", () => {
    expect(ABOUT_URL).toBe("https://genbreed.com.br/o-que-e");
    expect(ABOUT_PATH).toBe("/o-que-e");
    expect(page).toContain("title: ABOUT_TITLE");
    expect(page).toContain("description: ABOUT_DESCRIPTION");
    expect(page).toContain("alternates: { canonical: ABOUT_URL }");
    expect(page).toMatch(/openGraph:\s*{[\s\S]*images:\s*\[\{ url: ABOUT_OG_IMAGE/);
    expect(ABOUT_OG_IMAGE).toBe("https://genbreed.com.br/hero-tigre-albino.jpg");
    expect(existsSync(web("public/hero-tigre-albino.jpg"))).toBe(true);
  });

  it("o middleware NÃO cobre /o-que-e (rota pública, sem login) e, mesmo chamado, não redireciona com nem sem sessão", () => {
    const matchers = (middlewareConfig.matcher as string[]).map((m) => new RegExp(`^${m.replace("/:path*", "(?:/.*)?")}$`));
    expect(matchers.some((re) => re.test(ABOUT_PATH))).toBe(false);
    for (const cookie of [undefined, "gb_session=1"]) {
      const req = new NextRequest("https://genbreed.com.br/o-que-e", cookie ? { headers: { cookie } } : undefined);
      const res = middleware(req);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("blog da Hack Tech Farm: as entradas (se houver) têm título e URL https do domínio real; o bloco só aparece quando há entradas", () => {
    expect(ABOUT_BLOG_LINKS.length).toBeLessThanOrEqual(3);
    for (const l of ABOUT_BLOG_LINKS) {
      expect(l.title.trim().length).toBeGreaterThan(3);
      expect(l.url.startsWith("https://hacktechfarm.com.br/"), l.url).toBe(true);
      expect(text).toContain(l.title);
    }
    expect(page).toContain("ABOUT_BLOG_LINKS.length > 0");
  });

  it("os 3 artigos reais do blog estão na página, com URL exata e título que descreve o conteúdo (não a URL)", () => {
    expect(ABOUT_BLOG_LINKS.map((l) => l.url)).toEqual([
      "https://hacktechfarm.com.br/blog/genetica-da-cor-da-pelagem-em-gatos-guia-completo",
      "https://hacktechfarm.com.br/blog/por-que-gatos-tricolores-sao-quase-sempre-femeas",
      "https://hacktechfarm.com.br/blog/tigre-branco-genetica-da-cor-e-o-problema-da-endogamia",
    ]);
    for (const l of ABOUT_BLOG_LINKS) {
      expect(l.title).not.toMatch(/https?:|hacktechfarm|\//i);
      expect(text).toContain(l.title);
    }
    expect(text).toContain("Para entender a genética por trás do jogo");
  });

  it("links do blog: nova aba com rel=noopener e SEM nofollow (o objetivo é passar sinal entre os domínios)", () => {
    expect(page).toContain('href={l.url} target="_blank" rel="noopener"');
    const anchors = page.match(/<a [^>]*href=\{l\.url\}[^>]*>/g) ?? [];
    expect(anchors.length).toBe(1);
    expect(anchors[0]).not.toMatch(/nofollow/);
  });

  it("a landing aponta para a página em 3 lugares: link no topo do hero, fim da seção 'O que é' e rodapé", () => {
    const landing = readFileSync(web("app/page.tsx"), "utf8");
    expect(landing.match(/href="\/o-que-e"/g)!.length).toBe(3);
    expect(landing).toContain("Ver a explicação completa");
    expect(landing).toMatch(/absolute right-5 top-5[^>]*>\s*O que é\s*</);
    expect(page).toContain('href="/"'); // volta para a landing
  });
});
