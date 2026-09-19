/**
 * "Avisar quando nascer" (Web Push, ADR-0028) — lógica PURA (sem DOM): qual estado a tela
 * mostra e os textos. O componente (`components/NotifyButton.tsx`) só junta o que o
 * navegador informa e chama isto.
 *
 * Limitação do iPhone (não dá pra contornar): notificação só existe com o app INSTALADO na
 * tela inicial (pelo Safari) e iOS 16.4 ou mais novo. Por isso o estado "ios-install" vem
 * ANTES de qualquer pedido de permissão — fora do app instalado o iOS nem expõe o push.
 */
import type { InstallPlatform } from "./install-guide";

/** Chave pública VAPID em base64url → bytes, o formato que `pushManager.subscribe` exige. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** "CPU iPhone OS 17_4 like Mac OS X" → { major: 17, minor: 4 }. `null` se não for iOS ou não der pra ler (ex.: iPadOS em modo desktop). */
export function iosVersionFromUserAgent(userAgent: string): { major: number; minor: number } | null {
  const m = /(?:iPhone|iPad|iPod).*? OS (\d+)_(\d+)/.exec(userAgent ?? "");
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

/** O Web Push do iOS existe a partir do 16.4. */
export function iosSupportsPush(v: { major: number; minor: number } | null): boolean {
  if (!v) return true; // não deu pra ler a versão: não bloqueia; `supported` (PushManager) decide
  return v.major > 16 || (v.major === 16 && v.minor >= 4);
}

export type PushUiState =
  | "hidden"            // recurso desligado (sem chave na web ou sem VAPID na API): não mostra nada
  | "loading"           // ainda perguntando à API se o recurso está ligado
  | "ios-open-in-safari" // iPhone fora do Safari
  | "ios-too-old"       // iPhone com iOS < 16.4
  | "ios-install"       // iPhone no Safari, app NÃO instalado: instalar antes
  | "unsupported"       // navegador sem Service Worker/Push/Notification
  | "denied"            // permissão bloqueada: explicar como reverter
  | "subscribed"        // avisos ativos neste aparelho
  | "can-subscribe";    // pode pedir permissão e assinar

export interface PushUiInput {
  /** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` presente na web. */
  keyConfigured: boolean;
  /** `GET /push/config` → `enabled`; `null` = ainda carregando. */
  serverEnabled: boolean | null;
  platform: InstallPlatform;
  /** App rodando instalado (standalone). */
  installed: boolean;
  iosVersion: { major: number; minor: number } | null;
  /** `serviceWorker` E `PushManager` E `Notification` existem neste navegador. */
  supported: boolean;
  /** `Notification.permission`, ou `null` se `Notification` não existe. */
  permission: "default" | "granted" | "denied" | null;
  /** Já existe uma assinatura de push neste aparelho. */
  subscribed: boolean;
}

export function decidePushUi(i: PushUiInput): PushUiState {
  if (!i.keyConfigured || i.serverEnabled === false) return "hidden";
  if (i.serverEnabled === null) return "loading";
  if (i.platform === "ios-other") return "ios-open-in-safari";
  if (i.platform === "ios-safari") {
    if (!iosSupportsPush(i.iosVersion)) return "ios-too-old";
    if (!i.installed) return "ios-install"; // fora do app instalado o iOS nem expõe push
  }
  if (!i.supported) return "unsupported";
  if (i.permission === "denied") return "denied";
  if (i.subscribed && i.permission === "granted") return "subscribed";
  return "can-subscribe";
}

export const NOTIFY_BUTTON_LABEL = "Avisar quando nascer";
export const NOTIFY_OFF_LABEL = "Desativar avisos";
export const NOTIFY_EXPLANATION =
  "Receba uma notificação quando a gestação terminar e o filhote estiver pronto para nascer — mesmo com o app fechado.";
export const NOTIFY_SUBSCRIBED_TEXT = "Avisos ativados neste aparelho.";
/**
 * iPhone sem o app instalado: SÓ a regra e o caminho — os passos de instalação vivem num lugar só, o
 * cartão "Instale o app" do Perfil (`InstallApp variant="compact"`), pra qual o link abaixo aponta
 * (`installCardHref`). Nada de repetir a lista de passos aqui.
 */
export const NOTIFY_IOS_INSTALL_TEXT =
  "No iPhone, os avisos só funcionam com o app instalado na tela inicial. Depois de instalar, abra o GenBreedAI pelo ícone novo e volte aqui.";
export const NOTIFY_INSTALL_LINK_LABEL = "Ver como instalar o app";
export const NOTIFY_IOS_SAFARI_TEXT =
  "No iPhone, a instalação (e, por isso, os avisos) só funciona pelo Safari. Abra este endereço no Safari e instale o app na tela inicial.";
export const NOTIFY_IOS_TOO_OLD_TEXT =
  "Os avisos no iPhone exigem iOS 16.4 ou mais novo. Atualize o iOS para ativar.";
export const NOTIFY_UNSUPPORTED_TEXT = "Este navegador não suporta notificações.";

/** Como reverter uma permissão negada — cada sistema tem o seu caminho. */
export function deniedHelp(platform: InstallPlatform): string {
  const where =
    platform === "ios-safari" || platform === "ios-other"
      ? "Abra os Ajustes do iPhone → Notificações → GenBreedAI → e ative “Permitir notificações”."
      : platform === "android"
        ? "Toque no cadeado ao lado do endereço (ou segure o ícone do app → Informações do app) → Permissões → Notificações → Permitir."
        : "Clique no cadeado ao lado do endereço → Configurações do site → Notificações → Permitir.";
  return `Você bloqueou as notificações. Para reverter: ${where} Depois volte aqui e toque em “${NOTIFY_BUTTON_LABEL}” de novo.`;
}
