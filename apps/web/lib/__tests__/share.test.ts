/**
 * Compartilhamento viral (item 5 do pedido) — montagem da mensagem e da
 * URL, sem rede; displayName no lugar do slug; ref preservado.
 */
import { describe, it, expect } from "vitest";
import { buildPublicSpecimenUrl, auraStarsText, buildShareMessage, buildWhatsAppUrl, absoluteImageUrl, PUBLIC_SHARE_ORIGIN } from "../share";

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
