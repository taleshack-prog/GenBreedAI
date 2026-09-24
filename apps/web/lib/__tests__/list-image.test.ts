/**
 * Imagem de LISTA (ADR-0037): miniatura quando existe, original quando não, fallback se a miniatura falhar ao carregar; a tela individual
 * continua com o original. Também confere que as telas de lista usam o helper e o carregamento preguiçoso, e que as telas individuais não.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pickListImage, swapToFallback, type ImgLike } from "../list-image";

const ORIGINAL = "https://img.genbreed.com.br/generated/abc.png?v=123";
const THUMB = "https://img.genbreed.com.br/generated/abc_thumb.jpg?v=123";
const web = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

describe("pickListImage — escolha entre miniatura e original", () => {
  it("LISTA com miniatura → a miniatura, e o original vira fallback", () => {
    expect(pickListImage(ORIGINAL, THUMB, true)).toEqual({ src: THUMB, fallback: ORIGINAL });
  });

  it("LISTA sem miniatura (retrato anterior à ADR-0027): o original, sem fallback", () => {
    expect(pickListImage(ORIGINAL, null, true)).toEqual({ src: ORIGINAL, fallback: null });
    expect(pickListImage(ORIGINAL, undefined, true)).toEqual({ src: ORIGINAL, fallback: null });
    expect(pickListImage(ORIGINAL, "", true)).toEqual({ src: ORIGINAL, fallback: null });
  });

  it("TELA INDIVIDUAL (preferThumb=false): SEMPRE o original, mesmo que exista miniatura", () => {
    expect(pickListImage(ORIGINAL, THUMB, false)).toEqual({ src: ORIGINAL, fallback: null });
  });

  it("sem nada → null (a tela mostra o placeholder de sempre); só a miniatura existindo → ela, como último recurso", () => {
    expect(pickListImage(null, null, true)).toBeNull();
    expect(pickListImage(undefined, undefined, false)).toBeNull();
    expect(pickListImage(null, THUMB, true)).toEqual({ src: THUMB, fallback: null });
    expect(pickListImage(null, THUMB, false)).toEqual({ src: THUMB, fallback: null });
  });

  it("URLs relativas (sem R2, disco local) valem igual", () => {
    expect(pickListImage("/assets/generated/k.png?v=1", "/assets/generated/k_thumb.jpg?v=1", true))
      .toEqual({ src: "/assets/generated/k_thumb.jpg?v=1", fallback: "/assets/generated/k.png?v=1" });
  });
});

describe("swapToFallback — a miniatura falhou ao carregar", () => {
  const img = (src: string): ImgLike => ({ src, dataset: {} });

  it("troca para o original UMA vez", () => {
    const el = img(THUMB);
    expect(swapToFallback(el, ORIGINAL)).toBe(true);
    expect(el.src).toBe(ORIGINAL);
  });

  it("se o original também falhar não entra em laço: segunda chamada não troca de novo", () => {
    const el = img(THUMB);
    swapToFallback(el, ORIGINAL);
    el.src = "https://fora-do-ar/x.png";
    expect(swapToFallback(el, ORIGINAL)).toBe(false);
    expect(el.src).toBe("https://fora-do-ar/x.png");
  });

  it("sem fallback (o original já era o src): não faz nada", () => {
    const el = img(ORIGINAL);
    expect(swapToFallback(el, null)).toBe(false);
    expect(el.src).toBe(ORIGINAL);
  });
});

describe("as telas", () => {
  it("as LISTAS (galeria de espécies, Gene Bank) usam a miniatura; o card individual/laboratório NÃO", () => {
    expect(web("app/app/species/page.tsx")).toMatch(/<CapsuleCard[^\n]*\bpreferThumb\b/);
    expect(web("app/app/gene-bank/page.tsx")).toMatch(/<CapsuleCard[^\n]*\bpreferThumb\b/);
    expect(web("app/app/reveal/[id]/page.tsx")).not.toContain("preferThumb"); // tela individual do espécime: original
    expect(web("app/app/page.tsx")).not.toContain("preferThumb"); // laboratório (2 cartas de progenitores): original
  });

  it("o card só aplica loading=lazy nas listas e sempre passa pelo helper com fallback", () => {
    const card = web("components/CapsuleCard.tsx");
    expect(card).toContain("pickListImage(aiUrl, fetchedThumb ?? specimen?.thumbUrl, preferThumb)");
    expect(card).toMatch(/preferThumb \? \{ loading: "lazy"/);
    expect(card).toContain("swapToFallback(ev.currentTarget, listImg.fallback)");
  });

  it("a incubadora (lista) usa a miniatura com lazy e fallback", () => {
    const page = web("app/app/incubadora/page.tsx");
    expect(page).toContain("pickListImage(e.imageUrl, e.thumbUrl, true)");
    expect(page).toContain('loading="lazy"');
    expect(page).toContain("swapToFallback(ev.currentTarget, img.fallback)");
  });
});
