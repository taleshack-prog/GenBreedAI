/**
 * sitemap.xml e robots.txt (recursos nativos do Next 15): o sitemap lista só rotas públicas reais, contém /o-que-e e nunca
 * /app/ nem /f/; o robots libera o site, bloqueia /app/ e aponta para o sitemap. Também confere os prazos de gestação da
 * página /o-que-e contra a tabela da API (gestation-time.ts).
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sitemap from "../../app/sitemap";
import robots from "../../app/robots";
import { PUBLIC_ROUTES, NON_INDEXABLE_PREFIXES, SITE_ORIGIN } from "../public-routes";
import { aboutVisibleText } from "../about";
import { FIRST_GESTATION_MINUTES, GESTATION_HOURS_BY_AURA } from "../gestation";
import {
  FIRST_GESTATION_MINUTES as API_FIRST, GESTATION_HOURS_BY_AURA as API_HOURS,
} from "../../../api/src/incubator/gestation-time";

const web = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const paths = () => sitemap().map((e) => new URL(e.url).pathname);

describe("sitemap.xml", () => {
  it("contém /o-que-e, a landing e as páginas legais, todas no domínio canônico https", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${SITE_ORIGIN}/o-que-e`);
    expect(urls).toContain(`${SITE_ORIGIN}/`);
    for (const p of ["/termos", "/privacidade", "/reembolso"]) expect(urls).toContain(`${SITE_ORIGIN}${p}`);
    for (const u of urls) expect(u.startsWith("https://genbreed.com.br/"), u).toBe(true);
  });

  it("NÃO contém /app/ nem /f/ (nem qualquer prefixo não indexável)", () => {
    for (const p of paths()) {
      for (const bad of NON_INDEXABLE_PREFIXES) expect(p.startsWith(bad), `${p} começa com ${bad}`).toBe(false);
      expect(p).not.toContain("/app/");
      expect(p).not.toContain("/f/");
    }
  });

  it("sem URL repetida, e cada rota pública tem a página correspondente em app/", () => {
    const urls = sitemap().map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toHaveLength(PUBLIC_ROUTES.length);
    for (const r of PUBLIC_ROUTES) {
      const file = r === "/" ? "app/page.tsx" : `app${r}/page.tsx`;
      expect(existsSync(web(file)), `${r} → ${file}`).toBe(true);
    }
  });
});

describe("robots.txt", () => {
  const r = robots();
  const rules = (Array.isArray(r.rules) ? r.rules[0] : r.rules) as { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] };

  it("libera o site, bloqueia /app/ e aponta para o sitemap", () => {
    expect(rules.userAgent).toBe("*");
    expect(rules.allow).toBe("/");
    expect([rules.disallow].flat()).toContain("/app/");
    expect(r.sitemap).toBe(`${SITE_ORIGIN}/sitemap.xml`);
  });

  it("não bloqueia a página /o-que-e nem as públicas do sitemap", () => {
    const blocked = [rules.disallow].flat().filter((x): x is string => typeof x === "string");
    for (const p of paths()) for (const b of blocked) expect(p.startsWith(b), `${p} bloqueada por ${b}`).toBe(false);
  });
});

describe("/o-que-e — prazos de gestação", () => {
  it("a página diz 5 minutos na primeira gestação e 12h a 48h nas seguintes, e os valores batem com a tabela da API", () => {
    expect(FIRST_GESTATION_MINUTES).toBe(API_FIRST);
    expect(GESTATION_HOURS_BY_AURA).toEqual(API_HOURS);
    const text = aboutVisibleText();
    expect(text).toContain(`A primeira gestação da conta leva ${API_FIRST} minutos`);
    expect(text).toContain(`de ${Math.min(...Object.values(API_HOURS))}h a ${Math.max(...Object.values(API_HOURS))}h, conforme a raridade do filhote`);
  });
});
