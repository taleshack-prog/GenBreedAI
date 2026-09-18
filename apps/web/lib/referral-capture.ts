/**
 * Captura do código de indicação (`?ref=`) — funções PURAS (recebem o
 * `Storage` por parâmetro), sem DOM/rede, pra ficarem testáveis direto.
 *
 * Fluxo (ADR-0024): quem abre o link do WhatsApp cai numa página PÚBLICA
 * (landing `/`, `/f/[id]`, `/signup`…) com `?ref=<código>`. `RefCapture`
 * (montado no layout raiz, então cobre TODAS as páginas) guarda o código em
 * localStorage por 30 dias; `register()`/`loginWithGoogle()` (lib/auth.ts)
 * o enviam no cadastro. Quem credita é SEMPRE o servidor, dentro do
 * registro — o cliente só informa "vim pelo link de X", nunca "credite X".
 */

export const REF_STORAGE_KEY = "gb:ref";
export const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Mesmo formato dos códigos gerados pela API (`genCode`: minúsculas+dígitos), com folga de caixa. */
const REF_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Aceita só o formato de código; qualquer outra coisa (vazio, `<script>`, gigante) vira `null`. */
export function sanitizeRef(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return REF_PATTERN.test(v) ? v : null;
}

/** Lê `?ref=` de uma query string (`window.location.search`). */
export function readRefFromSearch(search: string): string | null {
  try { return sanitizeRef(new URLSearchParams(search).get("ref")); } catch { return null; }
}

/** Guarda o código (último toque vence). Storage indisponível (modo privado) não quebra nada. */
export function storeRef(storage: StorageLike, code: string, now: number = Date.now()): void {
  try { storage.setItem(REF_STORAGE_KEY, JSON.stringify({ code, at: now })); } catch { /* sem storage: segue sem guardar */ }
}

/** Código guardado e ainda dentro dos 30 dias; vencido/corrompido é descartado. */
export function getStoredRef(storage: StorageLike, now: number = Date.now()): string | null {
  try {
    const raw = storage.getItem(REF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: unknown; at?: unknown };
    const code = typeof parsed.code === "string" ? sanitizeRef(parsed.code) : null;
    const at = typeof parsed.at === "number" ? parsed.at : NaN;
    if (!code || !Number.isFinite(at) || now - at > REF_TTL_MS) { storage.removeItem(REF_STORAGE_KEY); return null; }
    return code;
  } catch {
    return null;
  }
}

export function clearStoredRef(storage: StorageLike): void {
  try { storage.removeItem(REF_STORAGE_KEY); } catch { /* idem */ }
}

/** Lê o `?ref=` da URL e, se válido, guarda. Devolve o código capturado (ou `null`). */
export function captureRef(search: string, storage: StorageLike, now: number = Date.now()): string | null {
  const code = readRefFromSearch(search);
  if (code) storeRef(storage, code, now);
  return code;
}
