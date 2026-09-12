/**
 * Pipeline de imagem (TDD §5): genótipo → prompt → provider → moderação → cache
 * → storage → card. Cache determinístico pela cacheKey. Só expõe imagem com
 * status APPROVED (DoD §10). Sem FAL_KEY, opera em modo procedural (sem custo).
 */
import { Injectable } from "@nestjs/common";
import { sha256, hashGenotype, CANINE_PACK, FELINE_PACK } from "@genbreedai/engine";
import { CURRENT_ART_VERSION } from "@genbreedai/shared";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import { buildPrompt } from "./prompt";
import { resolveProvider } from "./provider";
import { moderate } from "./moderation";
import { exists, store, publicUrl, remove } from "./storage";
import { ImageJobRepository, type ImageJob } from "./image-job.repository";
import { ImageQuotaService, modelForTier } from "../economy/image-quota.service";
import { WalletService } from "../economy/wallet.service";
import { ForbiddenException } from "@nestjs/common";

export interface ImageResult { cacheKey: string; status: string; imageUrl: string | null; model: string; cached: boolean; prompt: string; }

function cacheKeyOf(s: StoredSpecimen): string {
  const packId = s.pack === "canine" ? CANINE_PACK.id : FELINE_PACK.id;
  return s.cacheKey ?? sha256(hashGenotype(s.genotype) + "|" + packId + "|" + CURRENT_ART_VERSION);
}

@Injectable()
export class ImageService {
  constructor(private readonly repo: SpecimenRepository, private readonly jobs: ImageJobRepository, private readonly quota: ImageQuotaService, private readonly wallet: WalletService) {}

  async getCached(specimenId: string): Promise<ImageResult | null> {
    const s = await this.repo.get(specimenId);
    if (!s) return null;
    const cacheKey = cacheKeyOf(s);
    if (await exists(cacheKey)) return { cacheKey, status: "APPROVED", imageUrl: publicUrl(cacheKey), model: "cache", cached: true, prompt: buildPrompt(s) };
    const job = this.jobs.get(cacheKey);
    return { cacheKey, status: job?.status ?? "NONE", imageUrl: job?.imageUrl ?? null, model: job?.model ?? "procedural", cached: false, prompt: buildPrompt(s) };
  }

  async generate(specimenId: string, tier: string, force = false, skipQuota = false): Promise<ImageResult> {
    const s = await this.repo.get(specimenId);
    if (!s) throw new Error(`Espécime ${specimenId} não encontrado.`);
    return this.generateForSpecimen(s, tier, force, skipQuota);
  }

  /** Gera a partir de um espécime (real ou "preview" não persistido). */
  async generateForSpecimen(s: StoredSpecimen, tier: string, force = false, skipQuota = false): Promise<ImageResult> {
    const cacheKey = cacheKeyOf(s);
    const prompt = buildPrompt(s);
    if (force) await remove(cacheKey);
    // Rever imagem já gerada é GRÁTIS (não consome cota).
    if (!force && await exists(cacheKey)) return { cacheKey, status: "APPROVED", imageUrl: publicUrl(cacheKey), model: "cache", cached: true, prompt };

    // Gerar NOVA imagem REAL (fal) consome a cota mensal do tier. Procedural é grátis.
    const willUseFal = !!process.env.FAL_KEY;
    if (willUseFal && !skipQuota) {
      const ok = await this.quota.tryConsume(s.ownerId, tier);
      if (!ok) {
        // Cota esgotada → tenta um crédito de imagem (referral/compra/semanal).
        const credit = await this.wallet.consumeImageCredit(s.ownerId);
        if (!credit) throw new ForbiddenException("Sem cota mensal nem créditos de imagem. Indique amigos para ganhar créditos, colete o bônus semanal, ou compre créditos.");
      }
    }

    const provider = resolveProvider(modelForTier(tier));
    const img = await provider.generate(prompt, cacheKey);
    const mod = moderate(!!img.buffer);
    let imageUrl: string | null = null;
    let status: ImageJob["status"] = "APPROVED";
    if (mod.status === "REJECTED") status = "REJECTED";
    else if (img.buffer) imageUrl = await store(cacheKey, img.buffer);
    this.jobs.save({ cacheKey, specimenId: s.id, tier, model: img.model, resolution: "square_hd", status, moderationStatus: mod.status, imageUrl });
    return { cacheKey, status, imageUrl, model: img.model, cached: false, prompt };
  }
}
