/**
 * Chaves VAPID do Web Push (ADR-0028). O recurso só existe com AS DUAS chaves
 * (`VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`); sem elas fica DESLIGADO, sem quebrar
 * nada: `GET /push/config` diz `enabled:false`, `POST /push/subscribe` responde 503,
 * o serviço de envio vira no-op e `push:dispatch` avisa e sai sem tocar em nada.
 *
 * Lida a CADA chamada (função, não constante do import): os testes trocam as env
 * entre casos. Nunca devolve nem loga a chave privada fora de `vapidConfig()`.
 */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** `mailto:` ou URL do responsável, exigido pelo protocolo VAPID. Padrão: o site. */
  subject: string;
}

const DEFAULT_SUBJECT = "https://genbreed.com.br";

/** `null` = recurso desligado (falta alguma das duas chaves, ou está em branco). */
export function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || DEFAULT_SUBJECT };
}

export function isPushEnabled(): boolean {
  return vapidConfig() !== null;
}

/**
 * `true` quando SÓ UMA das chaves está definida — configuração incompleta (provável
 * erro de deploy). Não derruba o boot (recurso opcional), mas o script de dispatch
 * e o log deixam claro em vez de "desligar em silêncio".
 */
export function vapidPartiallyConfigured(): boolean {
  const hasPub = Boolean(process.env.VAPID_PUBLIC_KEY?.trim());
  const hasPriv = Boolean(process.env.VAPID_PRIVATE_KEY?.trim());
  return hasPub !== hasPriv;
}
