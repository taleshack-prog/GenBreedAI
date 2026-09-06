/**
 * Pipeline de imagem (TDD §5): genótipo → prompt → provider → moderação → cache
 * → storage → card. Cache determinístico pela cacheKey. Só expõe imagem com
 * status APPROVED (DoD §10). Sem FAL_KEY, opera em modo procedural (sem custo).
 */
import { Injectable } from "@nestjs/common";
import { sha256, hashGenotype } from "@genbreedai/engine";
import { CURRENT_ART_VERSION } from "@genbreedai/shared";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import { buildPrompt } from "./prompt";
import { resolveProvider } from "./provider";
import { moderate } from "./moderation";
import { exists, store, publicUrl } from "./storage";
import { ImageJobRepository, type ImageJob } from "./image-job.repository";

export interface ImageResult { cacheKey: string; status: string; imageUrl: string | null; model: string; cached: boolean; prompt: string; }

function cacheKeyOf(s: StoredSpecimen): string {
  return s.cacheKey ?? sha256(hashGenotype(s.genotype) + "|" + `pack-${s.pack}` + "|" + CURRENT_ART_VERSION);
}

@Injectable()
export class ImageService {
  constructor(private readonly repo: SpecimenRepository, private readonly jobs: ImageJobRepository) {}

  async getCached(specimenId: string): Promise<ImageResult | null> {
    const s = await this.repo.get(specimenId);
    if (!s) return null;
    const cacheKey = cacheKeyOf(s);
    if (await exists(cacheKey)) return { cacheKey, status: "APPROVED", imageUrl: publicUrl(cacheKey), model: "cache", cached: true, prompt: buildPrompt(s) };
    const job = this.jobs.get(cacheKey);
    return { cacheKey, status: job?.status ?? "NONE", imageUrl: job?.imageUrl ?? null, model: job?.model ?? "procedural", cached: false, prompt: buildPrompt(s) };
  }

  async generate(specimenId: string, tier: string): Promise<ImageResult> {
    const s = await this.repo.get(specimenId);
    if (!s) throw new Error(`Espécime ${specimenId} não encontrado.`);
    const cacheKey = cacheKeyOf(s);
    const prompt = buildPrompt(s);

    if (await exists(cacheKey)) return { cacheKey, status: "APPROVED", imageUrl: publicUrl(cacheKey), model: "cache", cached: true, prompt };

    const provider = resolveProvider();
    const img = await provider.generate(prompt, cacheKey);
    const mod = moderate(!!img.buffer);

    let imageUrl: string | null = null;
    let status: ImageJob["status"] = "APPROVED";
    if (mod.status === "REJECTED") { status = "REJECTED"; }
    else if (img.buffer) { imageUrl = await store(cacheKey, img.buffer); }
    // sem buffer (procedural) → sem imageUrl; card usa retrato vetorial.

    this.jobs.save({ cacheKey, specimenId: s.id, tier, model: img.model, resolution: "square_hd", status, moderationStatus: mod.status, imageUrl });
    return { cacheKey, status, imageUrl, model: img.model, cached: false, prompt };
  }
}
