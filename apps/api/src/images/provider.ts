/**
 * Provedores de imagem. FalImageProvider (fal.ai / FLUX) via FAL_KEY; e o
 * ProceduralImageProvider (fallback tier grátis, sem custo). Plugável por env.
 */
import { numericSeed } from "./prompt";

export interface GeneratedImage { buffer: Buffer | null; model: string; sourceUrl?: string }
export interface ImageProvider { readonly model: string; generate(prompt: string, cacheKey: string): Promise<GeneratedImage>; }

/** Procedural: sem chamada externa. O card usa o retrato vetorial (placeholder). */
export class ProceduralImageProvider implements ImageProvider {
  readonly model = "procedural";
  async generate(): Promise<GeneratedImage> { return { buffer: null, model: this.model }; }
}

/**
 * fal.ai — FLUX.2 [pro] por padrão (fal-ai/flux-2-pro, US$0,03/imagem
 * 1024x1024, mesmo modelo em todo tier — ver modelForTier). Configurável por
 * FAL_MODEL. Requer FAL_KEY no ambiente. Chama o endpoint síncrono e baixa a
 * imagem. SEM SDK da fal instalado neste repo (nenhum pacote @fal-ai/* nas
 * dependências) — chama a REST API crua via fetch(); não há tipo de entrada
 * gerado pra conferir contra o schema real de "fal-ai/flux-2-pro".
 *
 * Payload — só campos que o FLUX.2 [pro] aceita (conferir contra a doc real
 * da fal antes de ir pra produção, na ausência de SDK/tipos aqui):
 *   - prompt, seed (numericSeed(cacheKey) — determinístico, ADR de cache),
 *     enable_safety_checker: mantidos, mesmo uso de sempre.
 *   - image_size: "square_hd" (1024×1024) — mesma convenção já usada pros
 *     outros modelos FLUX desta integração; NÃO trocado para width/height
 *     avulsos por falta de como confirmar qual formato o flux-2-pro espera
 *     sem SDK/rede (decisão conservadora — reportado, não uma certeza).
 *   - output_format: "png" — adicionado (chave comum a vários endpoints FLUX
 *     da fal); mesma ressalva de confirmação acima.
 *   - NÃO envia num_inference_steps nem guidance_scale — o FLUX.2 [pro] não
 *     os usa (aviso do pedido); este provider nunca os enviou de qualquer
 *     forma (não existiam no payload anterior — não havia o que remover).
 */
export class FalImageProvider implements ImageProvider {
  readonly model: string;
  constructor(private readonly apiKey: string, model = process.env.FAL_MODEL ?? "fal-ai/flux-2-pro") { this.model = model; }

  async generate(prompt: string, cacheKey: string): Promise<GeneratedImage> {
    const res = await fetch(`https://fal.run/${this.model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${this.apiKey}` },
      body: JSON.stringify({
        prompt, image_size: "square_hd", num_images: 1,
        seed: numericSeed(cacheKey), enable_safety_checker: true, output_format: "png",
      }),
    });
    if (!res.ok) throw new Error(`fal.ai ${res.status}: ${await res.text().catch(() => "")}`);
    const data = (await res.json()) as { images?: { url: string }[] };
    const url = data.images?.[0]?.url;
    if (!url) throw new Error("fal.ai: resposta sem imagem.");
    const img = await fetch(url);
    const buffer = Buffer.from(await img.arrayBuffer());
    return { buffer, model: this.model, sourceUrl: url };
  }
}

/** Escolhe o provedor por ambiente (FAL_KEY → fal.ai; senão procedural). */
export function resolveProvider(model?: string): ImageProvider {
  const key = process.env.FAL_KEY;
  return key ? new FalImageProvider(key, model) : new ProceduralImageProvider();
}
