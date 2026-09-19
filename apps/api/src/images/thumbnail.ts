/**
 * Miniatura do retrato (ADR-0027) — 600×600, JPEG ~q80, alvo < 200 KB — pra
 * og:image do compartilhamento. O WhatsApp ignora imagem grande (limite prático
 * ~300 KB) ao montar o card; o retrato original (PNG 1024×1024) passa de 1 MB.
 *
 * `sharp` NÃO está nas dependências declaradas da API ainda (instalação à
 * parte: `pnpm --filter @genbreedai/api add sharp`). Por isso é carregado por
 * `import()` dinâmico com o nome numa variável (o TypeScript não tenta resolver
 * o módulo, então `pnpm typecheck` passa antes e depois da instalação). Sem
 * `sharp`, `makeThumbnail` LANÇA — e quem chama (`storage.store`) trata como
 * falha da miniatura: registra em log e segue, o retrato original já foi salvo.
 */

export const THUMB_SIZE = 600;
/** Alvo de tamanho: abaixo do limite prático do WhatsApp (~300 KB), com folga. */
export const THUMB_MAX_BYTES = 200_000;
/** Qualidades tentadas, da melhor pra pior, até caber em THUMB_MAX_BYTES. */
export const THUMB_QUALITIES: readonly number[] = [80, 70, 60, 50];
/** Fundo usado ao achatar transparência (JPEG não tem alfa) — mesmo fundo do app. */
const FLATTEN_BACKGROUND = "#070b11";

export type ThumbEncoder = (input: Buffer, quality: number) => Promise<Buffer>;

/** Só o que usamos do `sharp` — evita depender dos tipos dele (não instalado). */
interface SharpInstance {
  resize(width: number, height: number, options: { fit: "cover" }): SharpInstance;
  flatten(options: { background: string }): SharpInstance;
  jpeg(options: { quality: number; mozjpeg?: boolean }): SharpInstance;
  toBuffer(): Promise<Buffer>;
}
type SharpFactory = (input: Buffer) => SharpInstance;

let sharpPromise: Promise<SharpFactory> | null = null;
function loadSharp(): Promise<SharpFactory> {
  if (!sharpPromise) {
    const name = "sharp"; // variável de propósito — ver o comentário do arquivo
    sharpPromise = import(name).then(
      (mod: { default?: SharpFactory }) => (mod.default ?? (mod as unknown as SharpFactory)),
      () => {
        sharpPromise = null; // permite tentar de novo se instalarem com o processo no ar
        throw new Error("sharp não está instalado (pnpm --filter @genbreedai/api add sharp) — miniatura não gerada");
      },
    );
  }
  return sharpPromise;
}

const sharpEncoder: ThumbEncoder = async (input, quality) => {
  const sharp = await loadSharp();
  return sharp(input)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
    .flatten({ background: FLATTEN_BACKGROUND })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
};

let encoderOverride: ThumbEncoder | null = null;
/** Só testes: troca o codificador (ex.: um falso, sem `sharp`). `null` restaura o real. */
export function setThumbnailEncoderForTesting(encoder: ThumbEncoder | null): void { encoderOverride = encoder; }

/**
 * PNG (ou qualquer imagem que o `sharp` leia) → JPEG 600×600. Tenta qualidades
 * decrescentes até caber em `THUMB_MAX_BYTES`; se nenhuma couber, devolve a
 * menor gerada (com aviso) — melhor uma miniatura um pouco acima do alvo que
 * nenhuma. Lança se o codificador falhar (inclusive `sharp` ausente).
 */
export async function makeThumbnail(input: Buffer): Promise<Buffer> {
  const encode = encoderOverride ?? sharpEncoder;
  let smallest: Buffer | null = null;
  for (const quality of THUMB_QUALITIES) {
    const out = await encode(input, quality);
    if (smallest === null || out.length < smallest.length) smallest = out;
    if (out.length <= THUMB_MAX_BYTES) return out;
  }
  console.warn(`[thumbnail] miniatura de ${smallest!.length} bytes ficou acima do alvo de ${THUMB_MAX_BYTES} (mesmo na menor qualidade).`);
  return smallest!;
}
