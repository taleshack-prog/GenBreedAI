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
 * fal.ai — FLUX. Modelo configurável por FAL_MODEL (default fal-ai/flux/dev).
 * Requer FAL_KEY no ambiente. Chama o endpoint síncrono e baixa a imagem.
 */
export class FalImageProvider implements ImageProvider {
  readonly model: string;
  constructor(private readonly apiKey: string, model = process.env.FAL_MODEL ?? "fal-ai/flux/dev") { this.model = model; }

  async generate(prompt: string, cacheKey: string): Promise<GeneratedImage> {
    const res = await fetch(`https://fal.run/${this.model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${this.apiKey}` },
      body: JSON.stringify({
        prompt, image_size: "square_hd", num_images: 1,
        seed: numericSeed(cacheKey), enable_safety_checker: true,
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
export function resolveProvider(): ImageProvider {
  const key = process.env.FAL_KEY;
  return key ? new FalImageProvider(key) : new ProceduralImageProvider();
}
