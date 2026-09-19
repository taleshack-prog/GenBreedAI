/**
 * Validação do `endpoint` de uma assinatura de push (ADR-0028). O endpoint é uma URL
 * FORNECIDA PELO CLIENTE e o servidor faz POST nela ao enviar — sem validar, uma conta
 * poderia apontar o servidor pra qualquer host (SSRF: serviços internos, metadados de
 * nuvem…). Por isso só aceitamos HTTPS nos hosts dos serviços de push reais dos
 * navegadores: Chrome/Android/Samsung/Edge-Chromium (FCM), Firefox (Mozilla), Safari
 * (Apple) e Windows (WNS). Um serviço de push novo, se surgir, exige atualizar esta lista.
 */
const ALLOWED_HOST_SUFFIXES = [
  "fcm.googleapis.com",        // Chrome, Edge, Samsung Internet, Brave, Opera (Android e desktop)
  "android.googleapis.com",    // FCM legado
  "push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  "push.apple.com",            // Safari / iOS / macOS (web.push.apple.com)
  "notify.windows.com",        // Edge legado / WNS
] as const;

export const MAX_ENDPOINT_LENGTH = 2048;

export function isAllowedPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
