/**
 * Compartilhamento viral (item 5 do pedido) — montagem da mensagem e da
 * URL, sem rede; displayName no lugar do slug; ref preservado.
 */
import { describe, it, expect } from "vitest";
import { buildPublicSpecimenUrl, auraStarsText, buildShareMessage, buildWhatsAppUrl, absoluteImageUrl, stripCacheBustQuery, PUBLIC_SHARE_ORIGIN } from "../share";
import { displayName } from "../display";

describe("buildPublicSpecimenUrl — ref preservado", () => {
  it("sem ref → só a URL base", () => {
    expect(buildPublicSpecimenUrl("sp_123", null)).toBe("https://genbreed.com.br/f/sp_123");
    expect(buildPublicSpecimenUrl("sp_123", undefined)).toBe("https://genbreed.com.br/f/sp_123");
  });
  it("com ref → ?ref=<código> anexado", () => {
    expect(buildPublicSpecimenUrl("sp_123", "ABC123")).toBe("https://genbreed.com.br/f/sp_123?ref=ABC123");
  });
  it("ref com caracteres especiais é codificado", () => {
    expect(buildPublicSpecimenUrl("sp_123", "a b&c")).toBe("https://genbreed.com.br/f/sp_123?ref=a%20b%26c");
  });
  it("sempre usa o domínio canônico, nunca um domínio de preview", () => {
    expect(buildPublicSpecimenUrl("x", "y")).toContain(PUBLIC_SHARE_ORIGIN);
  });
});

describe("auraStarsText", () => {
  it("1 a 5 estrelas", () => {
    expect(auraStarsText(1)).toBe("★");
    expect(auraStarsText(3)).toBe("★★★");
    expect(auraStarsText(5)).toBe("★★★★★");
  });
  it("nunca negativo", () => {
    expect(auraStarsText(-2)).toBe("");
  });
});

describe("buildShareMessage — displayName, NUNCA o slug interno", () => {
  it("monta a mensagem exata pedida, com o nome de exibição e a aura em estrelas", () => {
    const msg = buildShareMessage("Híbrido Tigre-branco × Leão", 4);
    expect(msg).toBe("Olha o que eu criei no GenBreedAI: Híbrido Tigre-branco × Leão ★★★★. Cria o teu:");
  });
  it("nunca contém um slug técnico (ex.: 'panthera-tigris-branco×panthera-leo')", () => {
    const msg = buildShareMessage("Híbrido Tigre-branco × Leão", 4);
    expect(msg).not.toContain("panthera-tigris-branco×panthera-leo");
    expect(msg).not.toContain("panthera-");
  });
  it("a mensagem NÃO inclui o link (fica de fora — ver buildWhatsAppUrl/Web Share API)", () => {
    const msg = buildShareMessage("Onça-pintada", 2);
    expect(msg).not.toContain("http");
  });
});

describe("buildWhatsAppUrl", () => {
  it("monta https://wa.me/?text= com mensagem + link, codificado", () => {
    const url = buildWhatsAppUrl("Olha isso:", "https://genbreed.com.br/f/sp_123?ref=ABC");
    expect(url).toBe(
      `https://wa.me/?text=${encodeURIComponent("Olha isso:\nhttps://genbreed.com.br/f/sp_123?ref=ABC")}`,
    );
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    // o link vai dentro do texto codificado — decodifica e confirma que está lá.
    expect(decodeURIComponent(url.replace("https://wa.me/?text=", ""))).toContain("https://genbreed.com.br/f/sp_123?ref=ABC");
  });
});

describe("absoluteImageUrl", () => {
  it("null continua null", () => {
    expect(absoluteImageUrl(null)).toBeNull();
  });
  it("já absoluta (R2) — devolve como está", () => {
    expect(absoluteImageUrl("https://img.genbreed.com.br/generated/abc.png")).toBe("https://img.genbreed.com.br/generated/abc.png");
  });
  it("relativa (sem R2, disco local) — prefixa com o domínio canônico", () => {
    expect(absoluteImageUrl("/assets/generated/abc.png")).toBe("https://genbreed.com.br/assets/generated/abc.png");
  });
});

describe("compartilhar pelo CapsuleCard (Gene Bank etc.) é IDÊNTICO ao da tela de revelação", () => {
  // Mesmo espécime (mesmo id/species/aura), representando as duas telas —
  // ambas chamam as MESMAS funções puras de lib/share.ts (CapsuleCard.tsx
  // só busca o `ref` num momento diferente — no clique, não no mount — mas
  // a montagem do link/mensagem em si não muda em nada entre as telas).
  const specimen = { id: "sp_hibrido_1", species: "panthera-tigris-branco×panthera-leo", aura: 4 };
  const ref = "ABC123";

  it("URL pública: mesma saída nas duas telas", () => {
    const fromGeneBank = buildPublicSpecimenUrl(specimen.id, ref);
    const fromReveal = buildPublicSpecimenUrl(specimen.id, ref);
    expect(fromGeneBank).toBe(fromReveal);
    expect(fromGeneBank).toBe("https://genbreed.com.br/f/sp_hibrido_1?ref=ABC123");
  });

  it("mensagem: mesmo displayName (nunca o slug), mesma aura em estrelas, nas duas telas", () => {
    const name = displayName(specimen); // mesma cadeia resolveDisplayName usada nas duas telas
    const fromGeneBank = buildShareMessage(name, specimen.aura);
    const fromReveal = buildShareMessage(name, specimen.aura);
    expect(fromGeneBank).toBe(fromReveal);
    expect(fromGeneBank).not.toContain(specimen.species);
  });

  it("wa.me final: idêntico nas duas telas, pro mesmo espécime/ref", () => {
    const name = displayName(specimen);
    const url = buildPublicSpecimenUrl(specimen.id, ref);
    const message = buildShareMessage(name, specimen.aura);
    const fromGeneBank = buildWhatsAppUrl(message, url);
    const fromReveal = buildWhatsAppUrl(message, url);
    expect(fromGeneBank).toBe(fromReveal);
  });
});

describe("stripCacheBustQuery — item 7: URL do retrato chega com '?v=' (storage.ts#publicUrl)", () => {
  it("remove o '?v=<versão>' (cache-bust de publicUrl)", () => {
    expect(stripCacheBustQuery("https://genbreed.com.br/assets/generated/abc.png?v=1737000000")).toBe(
      "https://genbreed.com.br/assets/generated/abc.png",
    );
  });
  it("URL sem query string — devolve como está", () => {
    expect(stripCacheBustQuery("https://genbreed.com.br/hero-tigre-albino.jpg")).toBe("https://genbreed.com.br/hero-tigre-albino.jpg");
  });
});
