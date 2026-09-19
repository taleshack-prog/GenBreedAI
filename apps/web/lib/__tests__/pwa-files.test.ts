/**
 * Arquivos estáticos da PWA (`public/`): o manifest cumpre o combinado, não
 * referencia ícone que não existe, e o service worker é o mínimo SEM cache
 * offline (cache mal feito serve conteúdo velho — ADR-0026).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const web = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const manifest = JSON.parse(readFileSync(web("public/manifest.webmanifest"), "utf8")) as {
  name: string; short_name: string; start_url: string; scope: string; display: string; orientation: string;
  background_color: string; theme_color: string; icons: { src: string; sizes: string; type?: string; purpose?: string }[];
};

describe("manifest.webmanifest", () => {
  it("nome, início em /app, standalone e retrato", () => {
    expect(manifest.name).toBe("GenBreedAI");
    expect(manifest.short_name).toBe("GenBreed");
    expect(manifest.start_url).toBe("/app");
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("portrait");
  });

  it("cores de tema e de fundo = o fundo real do app (globals.css, #070b11)", () => {
    const css = readFileSync(web("app/globals.css"), "utf8");
    expect(css).toMatch(/background-color:\s*#070b11/i);
    expect(manifest.theme_color.toLowerCase()).toBe("#070b11");
    expect(manifest.background_color.toLowerCase()).toBe("#070b11");
  });

  it("todo ícone declarado EXISTE em public/ (nada de apontar para arquivo inexistente)", () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) expect(existsSync(web(`public${icon.src}`)), icon.src).toBe(true);
  });

  it("o layout usa a mesma cor de tema e a barra de status opaca", () => {
    const layout = readFileSync(web("app/layout.tsx"), "utf8");
    expect(layout).toMatch(/themeColor:\s*"#070b11"/i);
    expect(layout).toMatch(/statusBarStyle:\s*"black"/);
    expect(layout).toMatch(/capable:\s*true/);
    expect(layout).toMatch(/ServiceWorkerRegister/);
  });
});

describe("public/sw.js — service worker mínimo, sem cache offline", () => {
  const sw = readFileSync(web("public/sw.js"), "utf8");
  const code = sw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // sem comentários

  it("tem um listener de fetch (o que o navegador quer ver para instalar)", () => {
    expect(code).toMatch(/addEventListener\(\s*"fetch"/);
  });

  it("NÃO usa cache nem intercepta respostas", () => {
    expect(code).not.toMatch(/\bcaches\b/);
    expect(code).not.toMatch(/respondWith/);
    expect(code).not.toMatch(/\bcache\.(add|put|match)/i);
  });
});
