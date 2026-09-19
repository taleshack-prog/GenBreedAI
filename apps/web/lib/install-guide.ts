/**
 * Instalar o GenBreedAI como app (PWA) — lógica PURA (sem DOM) da seção "Instale o
 * app" da landing: qual instrução mostrar PRIMEIRO a partir do user agent e os
 * textos. A outra instrução nunca é escondida, só vem depois.
 *
 * Por que importa: no iPhone, notificação só funciona com o site instalado na
 * tela inicial, e a instalação só existe pelo SAFARI (Chrome/Firefox/Edge no iOS
 * não têm "Adicionar à Tela de Início" de PWA).
 */

export type InstallPlatform =
  | "android"      // Android (Chrome e afins)
  | "ios-safari"   // iPhone/iPad no Safari — o único caminho de instalação no iOS
  | "ios-other"    // iPhone/iPad em outro navegador (Chrome, Firefox, Edge…) ou dentro de app (Instagram…)
  | "other";       // desktop ou desconhecido

export type InstallGuideId = "android" | "ios";

/** Navegadores de terceiros no iOS: todos usam WebKit, mas NÃO oferecem a instalação de PWA. */
const IOS_OTHER_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|YaBrowser|Brave|FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|Twitter/i;

/**
 * `maxTouchPoints`: o iPadOS 13+ se anuncia como "Macintosh" no user agent; só o
 * toque múltiplo o distingue de um Mac de verdade.
 */
export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent ?? "";
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  if (isIos) return IOS_OTHER_BROWSERS.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Ordem de exibição: a instrução do aparelho vem primeiro, a outra logo depois (nunca escondida). */
export function installGuideOrder(platform: InstallPlatform): [InstallGuideId, InstallGuideId] {
  return platform === "ios-safari" || platform === "ios-other" ? ["ios", "android"] : ["android", "ios"];
}

/**
 * `true` quando o app já roda instalado (standalone). `matchStandalone` =
 * `matchMedia("(display-mode: standalone)").matches`; `navigatorStandalone` =
 * `navigator.standalone` (só existe no Safari iOS).
 */
export function isRunningInstalled(matchStandalone: boolean, navigatorStandalone?: boolean): boolean {
  return matchStandalone || navigatorStandalone === true;
}

export const INSTALL_TITLE = "Instale o app";
export const INSTALL_INTRO =
  "O GenBreedAI funciona como app na tela inicial do celular: abre em tela cheia, sem barra do navegador.";

export const INSTALL_ANDROID_TITLE = "Android (Chrome)";
export const INSTALL_ANDROID_STEPS: readonly string[] = [
  "Abra o genbreed.com.br no Chrome.",
  "Toque no menu ⋮ (canto superior direito).",
  "Toque em “Instalar app” (em alguns aparelhos aparece como “Adicionar à tela inicial”).",
  "Confirme em “Instalar”.",
];

export const INSTALL_IOS_TITLE = "iPhone (Safari)";
export const INSTALL_IOS_STEPS: readonly string[] = [
  "Abra o genbreed.com.br no Safari.",
  "Toque no botão Compartilhar (o quadrado com uma seta para cima, na barra do Safari).",
  "Role a lista e toque em “Adicionar à Tela de Início”.",
  "Toque em “Adicionar”. O ícone do GenBreedAI aparece na tela inicial.",
];
export const INSTALL_IOS_WARNING =
  "No iPhone só funciona pelo Safari — não pelo Chrome, Firefox ou Edge, nem pelo navegador de dentro de outros apps (Instagram, WhatsApp…).";
/** Mostrado quando detectamos iOS fora do Safari: a ação concreta a fazer. */
export const INSTALL_IOS_OPEN_IN_SAFARI =
  "Você parece estar em outro navegador. Abra este mesmo endereço no Safari para poder instalar.";

export const INSTALL_WHY =
  "Instalar também é o que vai permitir avisar você quando o seu filhote nascer. Os avisos ainda não estão ativos — chegam em uma próxima atualização — e no iPhone exigem iOS 16.4 ou mais novo e o app instalado na tela inicial.";

export const INSTALL_ALREADY_INSTALLED = "Você já está usando o app instalado.";
export const INSTALL_BUTTON_LABEL = "Instalar";
