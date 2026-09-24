/**
 * Imagem de retrato em LISTAS (galeria de espécies, Gene Bank, incubadora) — ADR-0037. O PNG original passa de 1 MB; a miniatura 600×600 JPEG
 * (ADR-0027) tem dezenas de KB. Listas usam a miniatura; a tela individual do espécime continua com o original. Funções PURAS (sem DOM).
 *
 * Mesma ideia de `pickOgImage` em `lib/share.ts` (miniatura → original), só que sem o fallback genérico de prévia: aqui "sem imagem" é `null`
 * e a tela mostra o placeholder de sempre.
 */

export interface ListImage {
  /** URL a carregar primeiro. */
  src: string;
  /** URL para onde cair se `src` falhar ao carregar (a miniatura sumiu/404); `null` quando `src` já é o original. */
  fallback: string | null;
}

/**
 * Escolhe a imagem de uma LISTA.
 *  - `preferThumb` e a miniatura existe → miniatura (e o original vira `fallback`);
 *  - miniatura ausente (retrato anterior à ADR-0027, ou a geração dela falhou) → o original, sem fallback;
 *  - `preferThumb=false` (tela individual) → SEMPRE o original, mesmo que exista miniatura;
 *  - nada disponível → `null`.
 * Só a miniatura sozinha (sem original) é usada como último recurso.
 */
export function pickListImage(
  original: string | null | undefined,
  thumb: string | null | undefined,
  preferThumb: boolean,
): ListImage | null {
  const o = original ? original : null;
  const t = thumb ? thumb : null;
  if (preferThumb && t) return { src: t, fallback: o };
  if (o) return { src: o, fallback: null };
  if (t) return { src: t, fallback: null };
  return null;
}

/** Elemento mínimo de `<img>` (o `HTMLImageElement` real satisfaz; o teste usa um objeto simples). */
export interface ImgLike { src: string; dataset: Record<string, string | undefined> }

/**
 * `onError` de `<img>` de lista: troca UMA vez para o `fallback` (o original) quando a miniatura falha. A marca em `dataset` impede laço se o
 * original também falhar. Devolve `true` quando trocou.
 */
export function swapToFallback(el: ImgLike, fallback: string | null): boolean {
  if (!fallback || el.dataset.fallbackUsed === "1") return false;
  el.dataset.fallbackUsed = "1";
  el.src = fallback;
  return true;
}
