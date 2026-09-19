/**
 * Instalação como app (PWA): qual instrução a landing mostra primeiro, a partir do
 * user agent — lógica pura, sem DOM. Os user agents abaixo são de aparelhos reais.
 */
import { describe, it, expect } from "vitest";
import {
  detectInstallPlatform, installGuideOrder, isRunningInstalled,
  INSTALL_IOS_WARNING, INSTALL_ANDROID_STEPS, INSTALL_IOS_STEPS, INSTALL_WHY,
} from "../install-guide";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1",
  iphoneFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15",
  iphoneEdge: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/123.0.2420.97 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.12.108 (iPhone13,2; iOS 17_4; pt_BR; pt-BR; scale=3.00; 1170x2532; 558621516)",
  iphoneWhatsApp: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FBAV/450.0 FBAN/FBIOS",
  ipadSafariDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
};

describe("detectInstallPlatform", () => {
  it("iPhone no Safari → ios-safari (o único caminho de instalação no iOS)", () => {
    expect(detectInstallPlatform(UA.iphoneSafari)).toBe("ios-safari");
  });

  it("iPhone em Chrome, Firefox ou Edge → ios-other (não instala PWA; avisar para abrir no Safari)", () => {
    expect(detectInstallPlatform(UA.iphoneChrome)).toBe("ios-other");
    expect(detectInstallPlatform(UA.iphoneFirefox)).toBe("ios-other");
    expect(detectInstallPlatform(UA.iphoneEdge)).toBe("ios-other");
  });

  it("iPhone dentro de outro app (Instagram, Facebook) → ios-other", () => {
    expect(detectInstallPlatform(UA.iphoneInstagram)).toBe("ios-other");
    expect(detectInstallPlatform(UA.iphoneWhatsApp)).toBe("ios-other");
  });

  it("iPad em modo desktop ('Macintosh') só é iOS com toque múltiplo; Mac de verdade não", () => {
    expect(detectInstallPlatform(UA.ipadSafariDesktopMode, 5)).toBe("ios-safari");
    expect(detectInstallPlatform(UA.ipadSafariDesktopMode, 0)).toBe("other");
    expect(detectInstallPlatform(UA.macSafari)).toBe("other");
  });

  it("Android → android (Chrome ou Samsung Internet)", () => {
    expect(detectInstallPlatform(UA.androidChrome)).toBe("android");
    expect(detectInstallPlatform(UA.androidSamsung)).toBe("android");
  });

  it("desktop, vazio ou desconhecido → other (nunca lança)", () => {
    expect(detectInstallPlatform(UA.windowsChrome)).toBe("other");
    expect(detectInstallPlatform("")).toBe("other");
    expect(detectInstallPlatform(undefined as unknown as string)).toBe("other");
  });
});

describe("installGuideOrder — a instrução do aparelho primeiro, a outra sempre presente", () => {
  it("iOS (Safari ou outro navegador) → iPhone primeiro", () => {
    expect(installGuideOrder("ios-safari")).toEqual(["ios", "android"]);
    expect(installGuideOrder("ios-other")).toEqual(["ios", "android"]);
  });
  it("Android e desconhecido → Android primeiro", () => {
    expect(installGuideOrder("android")).toEqual(["android", "ios"]);
    expect(installGuideOrder("other")).toEqual(["android", "ios"]);
  });
  it("as duas instruções aparecem em todos os casos (nada é escondido)", () => {
    for (const p of ["android", "ios-safari", "ios-other", "other"] as const) {
      expect([...installGuideOrder(p)].sort()).toEqual(["android", "ios"]);
    }
  });
});

describe("isRunningInstalled", () => {
  it("standalone pelo display-mode (Android/desktop) ou por navigator.standalone (Safari iOS)", () => {
    expect(isRunningInstalled(true)).toBe(true);
    expect(isRunningInstalled(false, true)).toBe(true);
    expect(isRunningInstalled(false, false)).toBe(false);
    expect(isRunningInstalled(false)).toBe(false);
  });
});

describe("textos da seção (o que a landing promete)", () => {
  it("Android: menu ⋮ → Instalar app / Adicionar à tela inicial", () => {
    const t = INSTALL_ANDROID_STEPS.join(" ");
    expect(t).toMatch(/⋮/);
    expect(t).toMatch(/Instalar app/);
    expect(t).toMatch(/Adicionar à tela inicial/);
  });

  it("iPhone: Compartilhar → Adicionar à Tela de Início, e o aviso de que só o Safari serve", () => {
    const t = INSTALL_IOS_STEPS.join(" ");
    expect(t).toMatch(/Compartilhar/);
    expect(t).toMatch(/Adicionar à Tela de Início/);
    expect(INSTALL_IOS_WARNING).toMatch(/só funciona pelo Safari/);
    expect(INSTALL_IOS_WARNING).toMatch(/Chrome/);
  });

  it("não promete notificação já ativa: os avisos vêm 'em uma próxima atualização' (push ainda não existe)", () => {
    expect(INSTALL_WHY).toMatch(/filhote nascer/);
    expect(INSTALL_WHY).toMatch(/ainda não estão ativos/);
  });
});
