/**
 * "Avisar quando nascer" (ADR-0028): qual estado a tela mostra (decisão pura, sem DOM), os
 * textos (permissão negada explica como reverter; iPhone sem app instalado manda instalar
 * primeiro) e a conversão da chave VAPID. Os user agents são de aparelhos reais.
 */
import { describe, it, expect } from "vitest";
import {
  decidePushUi, urlBase64ToUint8Array, iosVersionFromUserAgent, iosSupportsPush, deniedHelp,
  NOTIFY_BUTTON_LABEL, NOTIFY_IOS_INSTALL_TEXT, type PushUiInput,
} from "../push";

const base: PushUiInput = {
  keyConfigured: true, serverEnabled: true, platform: "other", installed: false,
  iosVersion: null, supported: true, permission: "default", subscribed: false,
};
const ui = (over: Partial<PushUiInput>) => decidePushUi({ ...base, ...over });

describe("decidePushUi", () => {
  it("recurso desligado: sem chave na web OU API sem VAPID → escondido (nada quebra, só não aparece)", () => {
    expect(ui({ keyConfigured: false })).toBe("hidden");
    expect(ui({ serverEnabled: false })).toBe("hidden");
    expect(ui({ keyConfigured: false, serverEnabled: false })).toBe("hidden");
  });

  it("ainda perguntando à API → loading", () => {
    expect(ui({ serverEnabled: null })).toBe("loading");
  });

  it("Android/desktop: pode assinar; já assinado → subscribed", () => {
    expect(ui({ platform: "android" })).toBe("can-subscribe");
    expect(ui({ platform: "other" })).toBe("can-subscribe");
    expect(ui({ platform: "android", subscribed: true, permission: "granted" })).toBe("subscribed");
  });

  it("permissão NEGADA → denied (explica como reverter), mesmo que exista assinatura antiga", () => {
    expect(ui({ permission: "denied" })).toBe("denied");
    expect(ui({ permission: "denied", subscribed: true })).toBe("denied");
  });

  it("navegador sem Service Worker/Push → unsupported", () => {
    expect(ui({ supported: false })).toBe("unsupported");
  });

  it("iPhone no Safari SEM o app instalado → manda instalar primeiro (o iOS nem expõe push fora do app instalado)", () => {
    expect(ui({ platform: "ios-safari", installed: false, supported: false, iosVersion: { major: 17, minor: 4 } })).toBe("ios-install");
  });

  it("iPhone com o app instalado: segue o fluxo normal (assinar / negada / assinado)", () => {
    const ios = { platform: "ios-safari" as const, installed: true, iosVersion: { major: 17, minor: 4 } };
    expect(ui(ios)).toBe("can-subscribe");
    expect(ui({ ...ios, permission: "denied" })).toBe("denied");
    expect(ui({ ...ios, subscribed: true, permission: "granted" })).toBe("subscribed");
  });

  it("iPhone instalado mas sem PushManager → unsupported", () => {
    expect(ui({ platform: "ios-safari", installed: true, supported: false })).toBe("unsupported");
  });

  it("iPhone fora do Safari → abrir no Safari; iOS < 16.4 → atualizar (antes de pedir instalação)", () => {
    expect(ui({ platform: "ios-other" })).toBe("ios-open-in-safari");
    expect(ui({ platform: "ios-safari", iosVersion: { major: 16, minor: 3 } })).toBe("ios-too-old");
    expect(ui({ platform: "ios-safari", iosVersion: { major: 15, minor: 8 } })).toBe("ios-too-old");
  });
});

describe("iosVersionFromUserAgent / iosSupportsPush (Web Push no iOS: 16.4+)", () => {
  const UA = (v: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1`;
  it("lê a versão do user agent", () => {
    expect(iosVersionFromUserAgent(UA("17_4"))).toEqual({ major: 17, minor: 4 });
    expect(iosVersionFromUserAgent(UA("16_3_1"))).toEqual({ major: 16, minor: 3 });
  });
  it("não é iOS / não dá pra ler → null (não bloqueia)", () => {
    expect(iosVersionFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/123.0")).toBeNull();
    expect(iosVersionFromUserAgent("")).toBeNull();
    expect(iosSupportsPush(null)).toBe(true);
  });
  it("16.4 é o limite", () => {
    expect(iosSupportsPush({ major: 16, minor: 3 })).toBe(false);
    expect(iosSupportsPush({ major: 16, minor: 4 })).toBe(true);
    expect(iosSupportsPush({ major: 17, minor: 0 })).toBe(true);
    expect(iosSupportsPush({ major: 15, minor: 9 })).toBe(false);
  });
});

describe("textos", () => {
  it("permissão negada: explica como reverter, por sistema, e diz para tocar no botão de novo", () => {
    expect(deniedHelp("android")).toMatch(/cadeado/);
    expect(deniedHelp("android")).toMatch(/Permissões → Notificações/);
    expect(deniedHelp("ios-safari")).toMatch(/Ajustes do iPhone → Notificações → GenBreedAI/);
    expect(deniedHelp("other")).toMatch(/Configurações do site → Notificações/);
    for (const p of ["android", "ios-safari", "other"] as const) expect(deniedHelp(p)).toContain(NOTIFY_BUTTON_LABEL);
  });

  it("o botão se chama exatamente 'Avisar quando nascer'", () => {
    expect(NOTIFY_BUTTON_LABEL).toBe("Avisar quando nascer");
  });

  it("iPhone sem instalar: o texto manda instalar primeiro (Safari → Compartilhar → Adicionar à Tela de Início)", () => {
    expect(NOTIFY_IOS_INSTALL_TEXT).toMatch(/instalado na tela inicial/);
    expect(NOTIFY_IOS_INSTALL_TEXT).toMatch(/Safari/);
    expect(NOTIFY_IOS_INSTALL_TEXT).toMatch(/Adicionar à Tela de Início/);
  });
});

describe("urlBase64ToUint8Array — chave pública VAPID (base64url → bytes)", () => {
  it("decodifica base64url com e sem padding, e os caracteres - e _", () => {
    // "hello?>" em base64 = "aGVsbG8/Pg==" ; em base64url = "aGVsbG8_Pg"
    const bytes = urlBase64ToUint8Array("aGVsbG8_Pg");
    expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode("hello?>")));
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8_Pg=="))).toEqual(Array.from(bytes));
  });
  it("uma chave VAPID de 65 bytes (P-256 não comprimida) vira 65 bytes", () => {
    const raw = new Uint8Array(65).map((_, i) => (i * 7) % 256);
    const b64url = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(Array.from(urlBase64ToUint8Array(b64url))).toEqual(Array.from(raw));
  });
});
