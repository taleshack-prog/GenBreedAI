/**
 * Metadados da landing (`/`), item 6 do diagnóstico (26/11/2026): antes, a home saía só com o title "GenBreedAI", sem
 * description própria, Open Graph, canonical nem JSON-LD — o link compartilhado no WhatsApp/Instagram não tinha imagem.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { metadata } from "../../app/page";
import { ABOUT_OG_IMAGE, ABOUT_ORIGIN, ABOUT_URL, HOME_DESCRIPTION, HOME_TITLE, HOME_URL, buildAboutJsonLd, buildHomeJsonLd } from "../about";
import { PLANS, fmtBRL } from "../plans";

const web = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));

describe("metadata da landing", () => {
  it("title com a busca antes da marca, dentro do que o buscador exibe", () => {
    expect(metadata.title).toBe(HOME_TITLE);
    expect(HOME_TITLE.length).toBeLessThanOrEqual(60);
    expect(HOME_TITLE.toLowerCase()).toContain("simulador de genética");
    expect(HOME_TITLE).toContain("GenBreedAI");
  });

  it("description própria, até 160 caracteres", () => {
    expect(metadata.description).toBe(HOME_DESCRIPTION);
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it("canonical, Open Graph e Twitter apontam para a home e para uma imagem que existe em public/", () => {
    expect(metadata.alternates?.canonical).toBe(HOME_URL);
    const og = metadata.openGraph as { url?: string; images?: { url: string }[] };
    expect(og.url).toBe(HOME_URL);
    expect(og.images?.[0]?.url).toBe(ABOUT_OG_IMAGE);
    expect(ABOUT_OG_IMAGE.startsWith(ABOUT_ORIGIN)).toBe(true);
    expect(existsSync(web(`public${new URL(ABOUT_OG_IMAGE).pathname}`))).toBe(true);
    expect((metadata.twitter as { card?: string }).card).toBe("summary_large_image");
  });

  it("a rota é de servidor (senão o Next ignora o metadata) e injeta o JSON-LD", () => {
    const src = readFileSync(web("app/page.tsx"), "utf8");
    expect(src).not.toMatch(/^\s*["']use client["']/m);
    expect(src).toContain("buildHomeJsonLd()");
  });

  it("não chama de 'reais' retratos que são gerados por IA", () => {
    const landing = readFileSync(web("components/LandingPage.tsx"), "utf8");
    expect(landing).not.toMatch(/Retratos reais/);
  });
});

describe("JSON-LD da landing", () => {
  const graph = buildHomeJsonLd()["@graph"];
  const app = graph.find((n) => n["@type"] === "SoftwareApplication")!;

  it("é o mesmo SoftwareApplication de /o-que-e (mesmo @id)", () => {
    const about = buildAboutJsonLd()["@graph"].find((n) => n["@type"] === "SoftwareApplication")!;
    expect(app["@id"]).toBe(`${ABOUT_URL}#app`);
    expect(app["@id"]).toBe(about["@id"]);
    expect(app.offers).toEqual(about.offers);
  });

  it("ofertas = planos de plans.ts (Free + mensal e anual dos pagos), em BRL", () => {
    const offers = app.offers as { price: string; priceCurrency: string }[];
    expect(offers).toHaveLength(1 + (PLANS.length - 1) * 2);
    for (const p of PLANS.filter((x) => x.month > 0)) {
      expect(offers.map((o) => o.price)).toContain(p.month.toFixed(2));
      expect(fmtBRL(p.month)).toMatch(/^R\$ /);
    }
    for (const o of offers) expect(o.priceCurrency).toBe("BRL");
  });

  it("WebSite com a URL canônica da home", () => {
    const site = graph.find((n) => n["@type"] === "WebSite")!;
    expect(site.url).toBe(HOME_URL);
  });
});
