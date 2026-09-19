/**
 * Instalação como app (PWA): qual instrução a landing mostra primeiro, a partir do
 * user agent — lógica pura, sem DOM. Os user agents abaixo são de aparelhos reais.
 */
import { describe, it, expect } from "vitest";
import {
  detectInstallPlatform, installGuideOrder, isRunningInstalled, installGuidesFor, installCompactSteps, installCardHref,
  INSTALL_IOS_WARNING, INSTALL_ANDROID_STEPS, INSTALL_IOS_STEPS, INSTALL_WHY,
  INSTALL_CARD_ID, INSTALL_CARD_PAGE, INSTALL_COMPACT_ANDROID_STEPS, INSTALL_COMPACT_IOS_STEPS, INSTALL_COMPACT_INTRO, INSTALL_COMPACT_WHY,
  type InstallPlatform,
} from "../install-guide";
import { NOTIFY_BUTTON_LABEL } from "../push";

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

  it("o aviso de gestação concluída JÁ funciona (ADR-0028): Android e computador pelo navegador; iPhone só com o app instalado e iOS 16.4+", () => {
    expect(INSTALL_WHY).toMatch(/Gestação concluída/);
    expect(INSTALL_WHY).toMatch(/já funciona/);
    expect(INSTALL_WHY).toMatch(/pronto para nascer/);
    expect(INSTALL_WHY).toMatch(/Android e no computador/);
    expect(INSTALL_WHY).toMatch(/pelo navegador/);
    expect(INSTALL_WHY).toMatch(/iPhone só funciona com o app instalado na tela inicial/);
    expect(INSTALL_WHY).toMatch(/iOS 16\.4/);
    expect(INSTALL_WHY).toContain(`“${NOTIFY_BUTTON_LABEL}”`); // o nome do botão vem da mesma constante
  });

  it("NÃO trata a notificação como futura (nada de 'ainda não', 'em breve', 'próxima atualização', 'vai permitir')", () => {
    expect(INSTALL_WHY).not.toMatch(/ainda não|em breve|próxima atualização|vai permitir|chega(m)? (em|depois)/i);
  });
});

describe("cartão 'Instale o app' no Perfil (variante compact) — só o sistema detectado", () => {
  const ALL: InstallPlatform[] = ["android", "ios-safari", "ios-other", "other"];

  it("landing: SEMPRE as duas instruções, a do aparelho primeiro (nada escondido) — igual ao comportamento de antes", () => {
    for (const p of ALL) {
      expect(installGuidesFor(p, "landing")).toEqual([...installGuideOrder(p)]);
      expect([...installGuidesFor(p, "landing")].sort()).toEqual(["android", "ios"]);
    }
  });

  it("compact: Android → só Android; iPhone (Safari ou outro navegador) → só iPhone", () => {
    expect(installGuidesFor("android", "compact")).toEqual(["android"]);
    expect(installGuidesFor("ios-safari", "compact")).toEqual(["ios"]);
    expect(installGuidesFor("ios-other", "compact")).toEqual(["ios"]);
  });

  it("compact em desktop/desconhecido: nada — a menos que o navegador ofereça o convite nativo (aí só o botão 'Instalar')", () => {
    expect(installGuidesFor("other", "compact")).toEqual([]);
    expect(installGuidesFor("other", "compact", false)).toEqual([]);
    expect(installGuidesFor("other", "compact", true)).toEqual(["android"]);
    // o convite nativo não muda o que o iPhone mostra
    expect(installGuidesFor("ios-safari", "compact", true)).toEqual(["ios"]);
  });

  it("os passos do compact são MAIS CURTOS que os da landing e não repetem o texto dela", () => {
    expect(INSTALL_COMPACT_ANDROID_STEPS.length).toBeLessThan(INSTALL_ANDROID_STEPS.length);
    expect(INSTALL_COMPACT_IOS_STEPS.length).toBeLessThan(INSTALL_IOS_STEPS.length);
    for (const s of INSTALL_COMPACT_IOS_STEPS) expect(INSTALL_IOS_STEPS).not.toContain(s);
    for (const s of INSTALL_COMPACT_ANDROID_STEPS) expect(INSTALL_ANDROID_STEPS).not.toContain(s);
    expect(INSTALL_COMPACT_INTRO.length).toBeLessThan(80);
    expect(installCompactSteps("ios")).toBe(INSTALL_COMPACT_IOS_STEPS);
    expect(installCompactSteps("android")).toBe(INSTALL_COMPACT_ANDROID_STEPS);
  });

  it("os passos curtos continuam corretos: Compartilhar → Adicionar à Tela de Início (iPhone); menu ⋮ → Instalar app (Android)", () => {
    expect(INSTALL_COMPACT_IOS_STEPS.join(" ")).toMatch(/Safari/);
    expect(INSTALL_COMPACT_IOS_STEPS.join(" ")).toMatch(/Compartilhar/);
    expect(INSTALL_COMPACT_IOS_STEPS.join(" ")).toMatch(/Adicionar à Tela de Início/);
    expect(INSTALL_COMPACT_ANDROID_STEPS.join(" ")).toMatch(/⋮/);
    expect(INSTALL_COMPACT_ANDROID_STEPS.join(" ")).toMatch(/Instalar app/);
    expect(INSTALL_COMPACT_WHY).toMatch(/iPhone/);
    expect(INSTALL_COMPACT_WHY).toMatch(/gestação concluída/);
  });

  it("o cartão do Perfil tem a âncora #instalar-app e mora em /app/profile", () => {
    expect(INSTALL_CARD_ID).toBe("instalar-app");
    expect(INSTALL_CARD_PAGE).toBe("/app/profile");
  });
});

describe("installCardHref — pra onde o botão 'Avisar quando nascer' aponta", () => {
  it("no próprio Perfil: só a âncora (rola pro cartão na mesma página)", () => {
    expect(installCardHref("/app/profile")).toBe("#instalar-app");
    expect(installCardHref("/app/profile/")).toBe("#instalar-app");
  });
  it("em qualquer outra tela (ex.: Incubadora): leva ao Perfil já no cartão", () => {
    expect(installCardHref("/app/incubadora")).toBe("/app/profile#instalar-app");
    expect(installCardHref("/app")).toBe("/app/profile#instalar-app");
    expect(installCardHref("")).toBe("/app/profile#instalar-app");
    expect(installCardHref(null)).toBe("/app/profile#instalar-app");
    expect(installCardHref(undefined)).toBe("/app/profile#instalar-app");
  });
  it("o alvo existe: a âncora do link é o id do cartão", () => {
    expect(installCardHref("/app/incubadora").endsWith(`#${INSTALL_CARD_ID}`)).toBe(true);
  });
});
