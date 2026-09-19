/**
 * Arquivos estáticos da PWA (`public/`): o manifest cumpre o combinado, não
 * referencia ícone que não existe, e o service worker é o mínimo SEM cache
 * offline (cache mal feito serve conteúdo velho — ADR-0026).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

/** Cabeçalho PNG (assinatura + IHDR): largura, altura e tipo de cor (0 cinza, 2 RGB, 3 paleta, 4 cinza+alfa, 6 RGBA). */
function pngInfo(rel: string) {
  const b = readFileSync(web(rel));
  const signature = b.subarray(0, 8).toString("hex");
  return { signature, ihdr: b.subarray(12, 16).toString("ascii"), width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25]! };
}
const PNG_SIGNATURE = "89504e470d0a1a0a";
const hasAlpha = (colorType: number) => colorType === 4 || colorType === 6;

describe("ícones PNG (arte oficial: cromossomo com bandas, fundo #070b11)", () => {
  const EXPECTED = [
    { src: "/icon-192.png", size: 192, purpose: "any" },
    { src: "/icon-512.png", size: 512, purpose: "any" },
    { src: "/icon-maskable-512.png", size: 512, purpose: "maskable" },
  ];

  it("o manifest declara EXATAMENTE os três PNG, com sizes, type e purpose corretos (maskable só no maskable)", () => {
    expect(manifest.icons.map((i) => i.src)).toEqual(EXPECTED.map((e) => e.src));
    for (const e of EXPECTED) {
      const icon = manifest.icons.find((i) => i.src === e.src)!;
      expect(icon.sizes, e.src).toBe(`${e.size}x${e.size}`);
      expect(icon.type, e.src).toBe("image/png");
      expect(icon.purpose, e.src).toBe(e.purpose);
    }
    expect(manifest.icons.filter((i) => i.purpose === "maskable").length).toBe(1);
  });

  it("o tamanho DECLARADO é o tamanho REAL do arquivo (lido do cabeçalho do PNG), quadrado e opaco", () => {
    for (const e of EXPECTED) {
      const info = pngInfo(`public${e.src}`);
      expect(info.signature, `${e.src} não é PNG`).toBe(PNG_SIGNATURE);
      expect(info.ihdr).toBe("IHDR");
      expect([info.width, info.height], e.src).toEqual([e.size, e.size]);
      expect(hasAlpha(info.colorType), `${e.src} tem canal alfa (o fundo tem que ser opaco)`).toBe(false);
    }
  });

  it("apple-touch-icon.png: PNG 180×180 OPACO (o iOS ignora SVG e pinta transparência de preto)", () => {
    const info = pngInfo("public/apple-touch-icon.png");
    expect(info.signature).toBe(PNG_SIGNATURE);
    expect([info.width, info.height]).toEqual([180, 180]);
    expect(hasAlpha(info.colorType)).toBe(false);
  });

  it("o layout aponta icons.apple para apple-touch-icon.png (180×180) e os ícones de aba para os PNG", () => {
    const layout = readFileSync(web("app/layout.tsx"), "utf8");
    expect(layout).toMatch(/apple:\s*\[\s*\{\s*url:\s*"\/apple-touch-icon\.png",\s*sizes:\s*"180x180"/);
    expect(layout).toMatch(/url:\s*"\/icon-192\.png"/);
    expect(layout).toMatch(/url:\s*"\/icon-512\.png"/);
    expect(existsSync(web("public/apple-touch-icon.png"))).toBe(true);
  });

  it("nada aponta para o icon.svg (não é mais a arte oficial): nem o manifest nem o layout", () => {
    expect(JSON.stringify(manifest)).not.toMatch(/icon\.svg/);
    expect(readFileSync(web("app/layout.tsx"), "utf8")).not.toMatch(/icon\.svg/);
  });
});

describe("textos da web não tratam a notificação como futura (o aviso de gestação concluída já funciona — ADR-0028)", () => {
  // Varre o código-fonte da web (fora de testes) atrás de frase que fale de aviso/notificação/push junto de "ainda não",
  // "em breve", "próxima atualização"… — foi exatamente o que ficou desatualizado em `INSTALL_WHY` depois que o push subiu.
  const files = (["app", "components", "lib"] as const).flatMap((dir) =>
    (readdirSync(web(dir), { recursive: true }) as string[])
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"))
      .map((f) => `${dir}/${f}`));
  const FUTURE = /(avis|notifica|push)[^\n]{0,100}(ainda n[aã]o|em breve|pr[oó]xima atualiza|vai permitir|chega(m)? (em|depois))/i;

  it("acha os arquivos (o guarda não passa por não olhar nada)", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain("lib/install-guide.ts");
  });

  it("nenhum texto fala de aviso/notificação/push como algo futuro", () => {
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(web(f), "utf8").split("\n").forEach((line, i) => {
        if (FUTURE.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
      });
    }
    expect(offenders).toEqual([]);
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

  it("push (ADR-0028): SEMPRE mostra uma notificação (o Safari/iOS revoga quem recebe push sem exibir), com título, corpo e ícone 192", () => {
    expect(code).toMatch(/addEventListener\(\s*"push"/);
    expect(code).toMatch(/showNotification\(\s*title\s*,\s*options\s*\)/);
    expect(code).toMatch(/event\.waitUntil\(\s*self\.registration\.showNotification/);
    expect(code).toMatch(/icon-192\.png/);
    expect(existsSync(web("public/icon-192.png"))).toBe(true);
  });

  it("clique na notificação (ADR-0028): fecha, abre/foca o app na Incubadora, só na MESMA origem", () => {
    expect(code).toMatch(/addEventListener\(\s*"notificationclick"/);
    expect(code).toMatch(/event\.notification\.close\(\)/);
    expect(code).toMatch(/clients\.openWindow\(/);
    expect(code).toMatch(/\.focus\(\)/);
    expect(code).toMatch(/const DEFAULT_URL = "\/app\/incubadora"/);
    expect(code).toMatch(/url\.origin === self\.location\.origin/); // nunca abre URL de outra origem
  });
});
