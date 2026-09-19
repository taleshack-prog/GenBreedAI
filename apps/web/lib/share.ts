/**
 * Compartilhamento viral (link público `/f/[id]` + WhatsApp) — funções
 * PURAS, sem rede/DOM, pra ficarem testáveis direto (item 5 do pedido:
 * "montagem da mensagem e da URL, sem rede").
 */

/**
 * Domínio canônico do link compartilhado — SEMPRE este, nunca
 * `window.location.origin` (que vazaria um domínio de preview/staging pro
 * link que vai pro WhatsApp de alguém de fora).
 */
export const PUBLIC_SHARE_ORIGIN = "https://genbreed.com.br";

/** URL pública de um espécime (`/f/:id`), com `ref` preservado quando presente. */
export function buildPublicSpecimenUrl(id: string, ref: string | null | undefined): string {
  const base = `${PUBLIC_SHARE_ORIGIN}/f/${id}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

/** "★★★★" — aura em estrelas, texto puro (sem JSX, pra caber numa mensagem de texto). */
export function auraStarsText(aura: number): string {
  return "★".repeat(Math.max(0, Math.round(aura)));
}

/**
 * Mensagem de compartilhamento — SEM o link embutido: quem chama decide
 * onde ele entra (a Web Share API leva `url` num campo à parte; o fallback
 * wa.me concatena no texto, ver `buildWhatsAppUrl`). `name` é SEMPRE o
 * `displayName` resolvido — nunca o slug interno de `species`.
 */
export function buildShareMessage(name: string, aura: number): string {
  return `Olha o que eu criei no GenBreedAI: ${name} ${auraStarsText(aura)}. Cria o teu:`;
}

/** `https://wa.me/?text=<mensagem + link, urlencoded>` — fallback quando `navigator.share` não existe. */
export function buildWhatsAppUrl(message: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`;
}

/**
 * `imageUrl` da API pode vir RELATIVO (sem R2 configurado — `storage.ts`
 * serve de `apps/web/public/assets/generated/`) ou ABSOLUTO (com R2). Open
 * Graph exige URL absoluta (o WhatsApp não resolve caminho relativo) — por
 * isso sempre prefixa com `PUBLIC_SHARE_ORIGIN` quando já não for absoluta.
 */
export function absoluteImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${PUBLIC_SHARE_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

/**
 * Remove a query string (hoje sempre só `?v=<versão>`, o cache-bust de
 * `storage.ts#publicUrl`) — só pra uso em META TAGS (og:image/twitter:image),
 * nunca na URL usada de verdade na página (`<img src>` continua com `?v=`,
 * que é o que garante a imagem atualizar quando o retrato é regenerado).
 * Alguns leitores de prévia (WhatsApp incluso, em alguns clientes/versões)
 * ignoram ou cacheiam mal uma og:image com query string.
 */
export function stripCacheBustQuery(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

/** Miniatura gerada pela API (ADR-0027): 600×600 JPEG. Mudar aqui só junto de `thumbnail.ts` na API. */
export const OG_THUMB_SIZE = 600;
/** Retrato original (fal.ai, `square_hd`): PNG 1024×1024. */
export const OG_ORIGINAL_SIZE = 1024;

export interface OgImage { url: string; width?: number; height?: number; type: string; alt: string }

/**
 * Imagem da prévia (og:image e twitter:image) de `/f/[id]`. O WhatsApp ignora
 * imagem grande (limite prático ~300 KB) e o retrato original passa de 1 MB,
 * então prefere a MINIATURA (600×600 JPEG). Ordem: miniatura → original
 * (retratos anteriores à miniatura, ou geração que falhou — como sempre foi) →
 * imagem genérica `fallbackUrl` (sem retrato ainda). Só dimensões/tipo que o
 * arquivo de fato tem: nunca declara 1024×1024 pro fallback, nem PNG pra miniatura.
 * Meta tags só: tira o `?v=` (a página continua exibindo a original COM `?v=`).
 */
export function pickOgImage(
  specimen: { displayName: string; imageUrl: string | null; thumbUrl?: string | null },
  fallbackUrl: string,
): OgImage {
  const alt = specimen.displayName;
  const thumb = absoluteImageUrl(specimen.thumbUrl ?? null);
  if (thumb) return { url: stripCacheBustQuery(thumb), width: OG_THUMB_SIZE, height: OG_THUMB_SIZE, type: "image/jpeg", alt };
  const original = absoluteImageUrl(specimen.imageUrl);
  if (original) return { url: stripCacheBustQuery(original), width: OG_ORIGINAL_SIZE, height: OG_ORIGINAL_SIZE, type: "image/png", alt };
  return { url: stripCacheBustQuery(fallbackUrl), type: "image/jpeg", alt };
}
