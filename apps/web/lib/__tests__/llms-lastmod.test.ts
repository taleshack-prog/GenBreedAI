/**
 * `/llms.txt` e o `lastmod` do sitemap (item 5 do diagnóstico, 26/11/2026).
 * - llms.txt: sai de `lib/about.ts`; todo preço, título de seção e rota pública que ele cita tem de bater com a fonte.
 * - lastmod: data válida, nunca no futuro, e — quando há histórico git completo — nunca anterior ao último commit dos
 *   arquivos de cada rota (esqueceu de atualizar `ROUTE_LASTMOD` depois de mexer na página → falha aqui).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sitemap from "../../app/sitemap";
import { GET } from "../../app/llms.txt/route";
import { llmsText } from "../llms";
import { aboutSections, planLine } from "../about";
import { PLANS } from "../plans";
import { PUBLIC_ROUTES, ROUTE_LASTMOD, ROUTE_SOURCES, publicUrl } from "../public-routes";

const webDir = fileURLToPath(new URL("../../", import.meta.url));

describe("llms.txt", () => {
  const txt = llmsText();

  it("segue o formato llmstxt.org: H1, resumo em citação, seções H2", () => {
    expect(txt.startsWith("# GenBreedAI\n\n> ")).toBe(true);
    expect(txt).toMatch(/\n## /);
  });

  it("traz a linha de preço de cada plano exatamente como /o-que-e", () => {
    for (const p of PLANS) expect(txt).toContain(`${p.label}: ${planLine(p)}`);
  });

  it("traz todas as seções de /o-que-e e todas as rotas públicas", () => {
    for (const s of aboutSections()) expect(txt).toContain(`## ${s.heading}`);
    for (const r of PUBLIC_ROUTES) expect(txt).toContain(`(${publicUrl(r)})`);
  });

  it("a rota devolve o mesmo texto como text/plain", async () => {
    const res = GET();
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe(txt);
  });
});

describe("lastmod do sitemap", () => {
  const hoje = new Date().toISOString().slice(0, 10);

  it("toda URL tem lastmod AAAA-MM-DD, não futuro", () => {
    for (const e of sitemap()) {
      expect(String(e.lastModified), e.url).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(e.lastModified) <= hoje, e.url).toBe(true);
    }
  });

  it("os arquivos de cada rota existem", () => {
    for (const r of PUBLIC_ROUTES) for (const f of ROUTE_SOURCES[r]) expect(existsSync(`${webDir}${f}`), f).toBe(true);
  });

  const git = (...args: string[]): string | null => {
    try { return execFileSync("git", args, { cwd: webDir, encoding: "utf8" }).trim(); } catch { return null; }
  };
  // Clone raso (Vercel, CI) não tem o histórico: a data do último commit seria a do enxerto, sem sentido. Pula.
  const historicoCompleto = git("rev-parse", "--is-shallow-repository") === "false";

  it.skipIf(!historicoCompleto)("lastmod nunca fica atrás do último commit dos arquivos da rota", () => {
    for (const r of PUBLIC_ROUTES) {
      const ultimo = git("log", "-1", "--format=%cs", "--", ...ROUTE_SOURCES[r]);
      if (!ultimo) continue;
      expect(ROUTE_LASTMOD[r] >= ultimo, `${r}: lastmod ${ROUTE_LASTMOD[r]} < commit ${ultimo}`).toBe(true);
    }
  });
});
