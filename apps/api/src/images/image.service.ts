/**
 * Pipeline de imagem (TDD §5): genótipo → prompt → provider → moderação → cache
 * → storage → card. Cache determinístico pela cacheKey. Só expõe imagem com
 * status APPROVED (DoD §10). Sem FAL_KEY, opera em modo procedural (sem custo).
 */
import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { computeCacheKey, CANINE_PACK, FELINE_PACK } from "@genbreedai/engine";
import type { Tier } from "@genbreedai/shared";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import { specimenVisibleAtTier } from "../common/tier-access";
import { buildPrompt } from "./prompt";
import { resolveProvider } from "./provider";
import { moderate } from "./moderation";
import { stat, store, publicUrl, remove } from "./storage";
import { ImageJobRepository, type ImageJob } from "./image-job.repository";
import { ImageQuotaService, modelForTier } from "../economy/image-quota.service";
import { WalletService } from "../economy/wallet.service";

export interface ImageResult { cacheKey: string; status: string; imageUrl: string | null; model: string; cached: boolean; prompt: string; }

/**
 * Chave GRAVADA (`s.cacheKey`) tem prioridade sempre — só recalcula (ADR-0017,
 * fórmula ÚNICA via `computeCacheKey`, nunca reimplementada aqui) pra
 * espécimes "preview" não persistidos (ver preview.controller.ts). Passa
 * `s.sex` pro cálculo — sem isso, `leao` e `leao-femea` cairiam na MESMA
 * chave e a leoa herdaria o retrato COM juba do macho (achado que originou
 * esta correção).
 */
function cacheKeyOf(s: StoredSpecimen): string {
  const pack = s.pack === "canine" ? CANINE_PACK : FELINE_PACK;
  return s.cacheKey ?? computeCacheKey(s.genotype, pack, s.sex ?? undefined);
}

@Injectable()
export class ImageService {
  constructor(private readonly repo: SpecimenRepository, private readonly jobs: ImageJobRepository, private readonly quota: ImageQuotaService, private readonly wallet: WalletService) {}

  /**
   * Quem pode gerar/ver o retrato de um espécime REAL (persistido): o DONO
   * (`s.ownerId === payerId`) OU um FUNDADOR (`method === "FOUNDER"`,
   * compartilhado por todos) — E o espécime tem que estar visível no pool do
   * tier do usuário (ADR-0016, mesma regra de cross.service.ts/gene-bank).
   * Caso contrário, 404 — nunca 403: não revela que o espécime existe (mesma
   * filosofia "escondido, sem cadeado" do pool).
   */
  private assertAccessible(s: StoredSpecimen, payerId: string, tier: Tier): void {
    const ownedOrFounder = s.ownerId === payerId || s.method === "FOUNDER";
    if (!ownedOrFounder || !specimenVisibleAtTier(tier, s.pack, s.species)) {
      throw new NotFoundException(`Espécime ${s.id} não encontrado.`);
    }
  }

  async getCached(specimenId: string, payerId: string, tier: Tier): Promise<ImageResult | null> {
    const s = await this.repo.get(specimenId);
    if (!s) throw new NotFoundException(`Espécime ${specimenId} não encontrado.`);
    this.assertAccessible(s, payerId, tier);
    const cacheKey = cacheKeyOf(s);
    const st = await stat(cacheKey);
    // Cache-busting: `?v=<versão do objeto>` (ver storage.ts) — sem isso,
    // navegador/CDN continuam servindo uma imagem regenerada anterior no
    // MESMO endereço (mesma cacheKey).
    if (st) return { cacheKey, status: "APPROVED", imageUrl: publicUrl(cacheKey, st.version), model: "cache", cached: true, prompt: buildPrompt(s) };
    const job = this.jobs.get(cacheKey);
    return { cacheKey, status: job?.status ?? "NONE", imageUrl: job?.imageUrl ?? null, model: job?.model ?? "procedural", cached: false, prompt: buildPrompt(s) };
  }

  /**
   * Gera o retrato de um espécime REAL (persistido) pedido por `payerId`
   * (usuário autenticado — NUNCA `s.ownerId`: fundadores são de "demo", e
   * cobrar do dono do espécime em vez de quem pediu dava 403 pra qualquer
   * usuário tentando gerar retrato de fundador). Acesso: `assertAccessible`.
   * Regenerar (`force`) só o DONO pode; fundador nunca (compartilhado —
   * regenerar trocaria a foto de todo mundo com o mesmo genótipo) — por
   * isso `remove()` só é alcançável daqui (`regenerateOwned`, privado),
   * depois que dono/fundador já foi checado. Nem `generateForSpecimen` nem
   * `previewImage` (preview de cruzamento) chamam `remove()` — GARANTIDO
   * pelo tipo: são os únicos métodos públicos que geram imagem além deste,
   * e nenhum dos dois recebe/usa `force` pra apagar nada.
   */
  async generate(specimenId: string, payerId: string, tier: Tier, force = false, skipQuota = false): Promise<ImageResult> {
    const s = await this.repo.get(specimenId);
    if (!s) throw new NotFoundException(`Espécime ${specimenId} não encontrado.`);
    this.assertAccessible(s, payerId, tier);
    if (force) {
      if (s.method === "FOUNDER") throw new ForbiddenException("Retratos de fundador não podem ser regenerados.");
      // `assertAccessible` só deixou chegar aqui sendo DONO ou FUNDADOR; o
      // `if` acima já descartou fundador — logo `s.ownerId === payerId`.
      return this.regenerateOwned(s, payerId, tier, skipQuota);
    }
    return this.generateForSpecimen(s, payerId, tier, skipQuota);
  }

  /**
   * Gera (ou devolve do cache) SEM NUNCA apagar nada — 1ª geração de um
   * espécime real (via `generate`, acesso já checado) ou preview de
   * cruzamento (via `previewImage`, sem dono/checagem, sempre livre pra
   * gerar mas nunca pra apagar). `payerId` é SEMPRE quem paga a cota/crédito
   * — nunca `s.ownerId`.
   */
  async generateForSpecimen(s: StoredSpecimen, payerId: string, tier: Tier, skipQuota = false): Promise<ImageResult> {
    const cacheKey = cacheKeyOf(s);
    const prompt = buildPrompt(s);
    const st = await stat(cacheKey);
    // Rever imagem já gerada é GRÁTIS (não consome cota) — e nunca apaga.
    if (st) return { cacheKey, status: "APPROVED", imageUrl: publicUrl(cacheKey, st.version), model: "cache", cached: true, prompt };
    return this.chargeAndGenerate(s, cacheKey, prompt, payerId, tier, skipQuota);
  }

  /**
   * Preview de cruzamento (não persistido, sem dono real) — MESMA regra
   * "nunca apaga" de `generateForSpecimen` (reusa o método por baixo). O
   * `force` do pedido de preview é IGNORADO de propósito: cacheKey é só
   * genótipo+pack+sexo, compartilhado por qualquer espécime igual (inclusive
   * fundador) — apagar aqui era exatamente o buraco original (qualquer
   * usuário apagava/trocava um retrato compartilhado pelo ↻ da prévia).
   * Havendo imagem, devolve a existente (versionada), sem gastar cota, sem
   * erro; não havendo, gera normalmente — igual com ou sem `force`.
   */
  async previewImage(s: StoredSpecimen, payerId: string, tier: Tier, skipQuota = false): Promise<ImageResult> {
    return this.generateForSpecimen(s, payerId, tier, skipQuota);
  }

  /**
   * REGENERA um espécime REAL apagando a imagem anterior — só chamado por
   * `generate()`, depois que dono (ou 404 antes) e "não é fundador" (ou 403
   * antes) já foram garantidos. Único método do serviço que chama `remove()`.
   *
   * LIMITAÇÃO CONHECIDA (reportada, não resolvida aqui): cacheKey é só
   * genótipo+pack+sexo — regenerar o retrato do PRÓPRIO espécime ainda troca
   * a imagem de QUALQUER OUTRO espécime (inclusive de outro dono, inclusive
   * fundador) que tenha o mesmo genótipo e sexo, porque compartilham a
   * mesma cacheKey. Corrigir isso exigiria a cacheKey deixar de ser só do
   * genótipo (ex.: incluir o id do espécime) — muda o esquema de cache e
   * quebra o reuso de imagem entre clones/gêmeos; fora do escopo aqui.
   */
  private async regenerateOwned(s: StoredSpecimen, payerId: string, tier: Tier, skipQuota = false): Promise<ImageResult> {
    const cacheKey = cacheKeyOf(s);
    const prompt = buildPrompt(s);
    await remove(cacheKey);
    return this.chargeAndGenerate(s, cacheKey, prompt, payerId, tier, skipQuota);
  }

  /** Cota/crédito + provider + moderação + storage + job — núcleo comum, sem decidir apagar nada. */
  private async chargeAndGenerate(s: StoredSpecimen, cacheKey: string, prompt: string, payerId: string, tier: Tier, skipQuota: boolean): Promise<ImageResult> {
    // Gerar NOVA imagem REAL (fal) consome a cota mensal do tier. Procedural é grátis.
    const willUseFal = !!process.env.FAL_KEY;
    if (willUseFal && !skipQuota) {
      const ok = await this.quota.tryConsume(payerId, tier);
      if (!ok) {
        // Cota esgotada → tenta um crédito de imagem (referral/compra/semanal).
        const credit = await this.wallet.consumeImageCredit(payerId);
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
