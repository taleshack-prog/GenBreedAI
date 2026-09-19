/**
 * Instalar o GenBreedAI como app (PWA) — lógica PURA (sem DOM) da seção "Instale o
 * app" da landing: qual instrução mostrar PRIMEIRO a partir do user agent e os
 * textos. A outra instrução nunca é escondida, só vem depois.
 *
 * Por que importa: no iPhone, notificação só funciona com o site instalado na
 * tela inicial, e a instalação só existe pelo SAFARI (Chrome/Firefox/Edge no iOS
 * não têm "Adicionar à Tela de Início" de PWA).
 */
// `import type` do lado de `push.ts` (que importa `InstallPlatform` daqui) é apagado na compilação: sem ciclo em tempo de execução.
import { NOTIFY_BUTTON_LABEL } from "./push";

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

/**
 * O aviso "Gestação concluída" (Web Push, ADR-0028) JÁ funciona em produção: chega quando o filhote
 * está pronto para nascer, mesmo com o app fechado. Android e computador recebem pelo navegador; no
 * iPhone só com o app instalado na tela inicial e iOS 16.4+ (por isso instalar importa lá). O botão é o
 * `NOTIFY_BUTTON_LABEL` de `lib/push.ts` — mesma fonte do texto do botão.
 */
export const INSTALL_WHY =
  `O aviso “Gestação concluída” já funciona: você é notificado quando o filhote estiver pronto para nascer, mesmo com o app fechado. No Android e no computador ele chega pelo navegador; no iPhone só funciona com o app instalado na tela inicial e iOS 16.4 ou mais novo. Depois de entrar, ative em “${NOTIFY_BUTTON_LABEL}” (Perfil ou Incubadora).`;

export const INSTALL_ALREADY_INSTALLED = "Você já está usando o app instalado.";
export const INSTALL_BUTTON_LABEL = "Instalar";

// ── Cartão "Instale o app" no Perfil (variante "compact" do InstallApp) ─────────
// Quem está logado nunca vê a landing (o middleware manda `/` → `/app`), então o Perfil
// também mostra como instalar — em versão CURTA e só do sistema detectado. Os textos que
// já existem (aviso "só pelo Safari", "abra no Safari", botão Instalar) são os MESMOS
// constantes da landing; só os passos são resumidos.

/** `landing` = seção grande com as duas instruções; `compact` = cartão do Perfil, só o sistema detectado. */
export type InstallVariant = "landing" | "compact";

/** Âncora do cartão no Perfil — o botão "Avisar quando nascer" aponta pra ele (`installCardHref`). */
export const INSTALL_CARD_ID = "instalar-app";
/** Onde o cartão mora. */
export const INSTALL_CARD_PAGE = "/app/profile";

export const INSTALL_COMPACT_INTRO = "Abre em tela cheia, direto da tela inicial.";
export const INSTALL_COMPACT_WHY = "No iPhone, instalar é obrigatório para receber o aviso de gestação concluída.";

export const INSTALL_COMPACT_ANDROID_STEPS: readonly string[] = [
  "No Chrome, toque no menu ⋮.",
  "Toque em “Instalar app” (ou “Adicionar à tela inicial”).",
];
export const INSTALL_COMPACT_IOS_STEPS: readonly string[] = [
  "No Safari, toque em Compartilhar.",
  "Toque em “Adicionar à Tela de Início”.",
];

export function installCompactSteps(guide: InstallGuideId): readonly string[] {
  return guide === "ios" ? INSTALL_COMPACT_IOS_STEPS : INSTALL_COMPACT_ANDROID_STEPS;
}

/**
 * Quais instruções mostrar. `landing`: as duas, a do aparelho primeiro (nada é escondido).
 * `compact` (Perfil): só a do sistema detectado — Android → Android; iPhone (Safari ou outro
 * navegador) → iPhone; desktop/desconhecido → nenhuma, EXCETO se o navegador ofereceu o convite
 * nativo de instalação (`canPrompt`, ex.: Chrome no desktop): aí o cartão existe só pra o botão
 * "Instalar" (mostrado com a instrução do Chrome).
 */
export function installGuidesFor(platform: InstallPlatform, variant: InstallVariant, canPrompt = false): InstallGuideId[] {
  if (variant === "landing") return [...installGuideOrder(platform)];
  if (platform === "android") return ["android"];
  if (platform === "ios-safari" || platform === "ios-other") return ["ios"];
  return canPrompt ? ["android"] : [];
}

/**
 * Link do botão "Avisar quando nascer" pro cartão de instalação: na própria página do Perfil
 * basta a âncora; em qualquer outra (ex.: Incubadora) leva ao Perfil já na âncora.
 */
export function installCardHref(pathname: string | null | undefined): string {
  const path = (pathname ?? "").replace(/\/+$/, "");
  return path === INSTALL_CARD_PAGE ? `#${INSTALL_CARD_ID}` : `${INSTALL_CARD_PAGE}#${INSTALL_CARD_ID}`;
}
