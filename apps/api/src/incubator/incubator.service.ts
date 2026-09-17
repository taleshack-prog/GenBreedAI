/**
 * Incubadora (ADR-0020): descrições de fenótipo vivem aqui de graça, sem
 * prazo, até o jogador revelar (gera o retrato de IA — consome revealQuota)
 * e/ou fazer nascer (materializa o espécime, grátis, reaproveitando a
 * imagem já revelada). "Congelar" preserva uma revelada-mas-não-nascida
 * (custa catalisadores, como o freezeOption antigo). Descartar (DELETE)
 * apaga a entrada — o "perder" é decisão/aviso da WEB, a API só executa.
 */
import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type { Tier } from "@genbreedai/shared";
import { IncubatorRepository, type StoredIncubatorEntry } from "./in-memory.repository";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import { ImageService, cacheKeyOf, type ImageResult } from "../images/image.service";
import { buildPrompt } from "../images/prompt";
import { stat, publicUrl } from "../images/storage";
import { QuotaService } from "../quota/quota.service";
import { WalletService, FREEZE_COST } from "../economy/wallet.service";
import { tierPolicy } from "../common/tiers";

export interface IncubatorEntryView {
  id: string; crossId: string; sireId: string; damId: string; method: string;
  pack: string; species: string; genotype: StoredIncubatorEntry["genotype"]; phenotype: StoredIncubatorEntry["phenotype"];
  prob: number; fPedigree: number; fixationIndex: number; aura: number; generation: number;
  sex: string; fertility: number | null; haldaneStatus: string | null;
  imageUrl: string | null; revealed: boolean; frozen: boolean; born: boolean; bornSpecimenId: string | null;
  createdAt: string;
}

@Injectable()
export class IncubatorService {
  constructor(
    private readonly repo: IncubatorRepository,
    private readonly specimens: SpecimenRepository,
    private readonly images: ImageService,
    private readonly quota: QuotaService,
    private readonly wallet: WalletService,
  ) {}

  /** `StoredIncubatorEntry` → objeto no formato `StoredSpecimen` que o pipeline de imagem (buildPrompt/generateForSpecimen) já entende. */
  private asFakeSpecimen(e: StoredIncubatorEntry): StoredSpecimen {
    return {
      id: e.id, ownerId: e.ownerId, pack: e.pack, species: e.species,
      genotype: e.genotype, phenotype: e.phenotype, generation: e.generation,
      sireId: e.sireId, damId: e.damId, method: e.method,
      fPedigree: e.fPedigree, fixationIndex: e.fixationIndex, aura: e.aura, cacheKey: null,
      sex: e.sex, fertility: e.fertility, haldaneStatus: e.haldaneStatus,
    };
  }

  private async getOwned(id: string, ownerId: string): Promise<StoredIncubatorEntry> {
    const e = await this.repo.get(id);
    if (!e || e.ownerId !== ownerId) throw new NotFoundException(`Descrição ${id} não encontrada.`);
    return e;
  }

  private toView(e: StoredIncubatorEntry, imageUrl: string | null): IncubatorEntryView {
    return {
      id: e.id, crossId: e.crossId, sireId: e.sireId, damId: e.damId, method: e.method,
      pack: e.pack, species: e.species, genotype: e.genotype, phenotype: e.phenotype,
      prob: e.prob, fPedigree: e.fPedigree, fixationIndex: e.fixationIndex, aura: e.aura, generation: e.generation,
      sex: e.sex, fertility: e.fertility, haldaneStatus: e.haldaneStatus,
      imageUrl, revealed: e.revealedAt !== null, frozen: e.frozen, born: e.bornSpecimenId !== null,
      bornSpecimenId: e.bornSpecimenId, createdAt: e.createdAt.toISOString(),
    };
  }

  /** GET /api/v1/incubator — tudo que a web precisa: descrição completa + estado. */
  async list(ownerId: string): Promise<IncubatorEntryView[]> {
    const entries = await this.repo.listByOwner(ownerId);
    const out: IncubatorEntryView[] = [];
    for (const e of entries) {
      let imageUrl: string | null = null;
      if (e.imageCacheKey) {
        const st = await stat(e.imageCacheKey);
        if (st) imageUrl = publicUrl(e.imageCacheKey, st.version);
      }
      out.push(this.toView(e, imageUrl));
    }
    return out;
  }

  /** Retrato já revelado — devolve sem cobrar (item 4: "Se já revelada, devolve a imagem sem cobrar"). */
  private async cachedImage(e: StoredIncubatorEntry): Promise<ImageResult> {
    const cacheKey = e.imageCacheKey ?? cacheKeyOf(this.asFakeSpecimen(e));
    const st = await stat(cacheKey);
    return {
      cacheKey, status: "APPROVED", imageUrl: st ? publicUrl(cacheKey, st.version) : null,
      model: "cache", cached: true, prompt: buildPrompt(this.asFakeSpecimen(e)),
    };
  }

  /**
   * POST /incubator/:id/reveal (ADR-0020, item 4). Reivindicação ATÔMICA
   * (`repo.claimReveal`, mesmo padrão de `claimIncludedPortrait`) ANTES de
   * cobrar — só quem ganha a reivindicação cobra; corrida (2 pedidos
   * simultâneos na MESMA entrada nunca revelada) faz o perdedor estornar o
   * que acabou de cobrar e devolver a imagem já revelada pelo vencedor, sem
   * cobrança dupla.
   */
  async reveal(id: string, ownerId: string, tier: Tier): Promise<ImageResult> {
    const entry = await this.getOwned(id, ownerId);
    if (entry.revealedAt !== null) return this.cachedImage(entry);

    const policy = tierPolicy(tier).revealQuota;
    const reservationId = await this.quota.reserve("reveal", ownerId, policy);
    let usedCredit = false;
    if (!reservationId) {
      usedCredit = await this.wallet.consumeImageCredit(ownerId);
      if (!usedCredit) {
        const nextAt = await this.quota.nextAvailableAt("reveal", ownerId, policy);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: "Sem cota de revelação nem créditos de imagem. Indique amigos, colete o bônus semanal, ou compre créditos.",
            error: "Too Many Requests",
            nextAvailableAt: nextAt ? nextAt.toISOString() : null,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    try {
      const fake = this.asFakeSpecimen(entry);
      // skipQuota=true SEMPRE: a cota/crédito de REVELAÇÃO já foi cobrada
      // acima (revealQuota, ADR-0020) — `generateForSpecimen` não deve
      // cobrar de novo pela cota MENSAL de retratos extras (ADR-0019),
      // que é uma coisa diferente (regenerar).
      const result = await this.images.generateForSpecimen(fake, ownerId, tier, true);
      const claimed = await this.repo.claimReveal(id, result.cacheKey);
      if (!claimed) {
        // Corrida: outro pedido revelou primeiro entre o get() e agora —
        // estorna o que cobramos (nunca cobra 2x pela mesma revelação) e
        // devolve a imagem que o vencedor já gerou.
        if (reservationId) await this.quota.release("reveal", reservationId);
        else if (usedCredit) await this.wallet.creditImageCredits(ownerId, 1);
        const fresh = await this.repo.get(id);
        return this.cachedImage(fresh!);
      }
      if (reservationId) await this.quota.confirm("reveal", reservationId);
      return result;
    } catch (e) {
      if (reservationId) await this.quota.release("reveal", reservationId);
      else if (usedCredit) await this.wallet.creditImageCredits(ownerId, 1);
      throw e;
    }
  }

  /**
   * POST /incubator/:id/born (ADR-0020, item 5) — só revelada; cria o
   * espécime COM os campos já gravados na entrada (genótipo, fenótipo,
   * sexo, fertilidade, F, IF, aura, cacheKey da imagem já revelada), SEM
   * recalcular nada. Grátis, sem cota — a imagem já foi paga na revelação.
   */
  async born(id: string, ownerId: string): Promise<{ specimen: StoredSpecimen }> {
    const entry = await this.getOwned(id, ownerId);
    if (entry.bornSpecimenId) throw new BadRequestException("Esta descrição já nasceu.");
    if (entry.revealedAt === null) throw new BadRequestException("Revele antes de fazer nascer.");
    const stored = await this.specimens.save({
      id: "", ownerId, pack: entry.pack, species: entry.species,
      genotype: entry.genotype, phenotype: entry.phenotype, generation: entry.generation,
      sireId: entry.sireId, damId: entry.damId, method: entry.method,
      fPedigree: entry.fPedigree, fixationIndex: entry.fixationIndex, aura: entry.aura,
      cacheKey: entry.imageCacheKey, status: "ALIVE",
      sex: entry.sex, fertility: entry.fertility, haldaneStatus: entry.haldaneStatus,
      // O retrato já foi PAGO na revelação (reusado aqui, não regenerado) —
      // nenhum "vale" de retrato incluído (ADR-0019) faz sentido de novo.
      includedPortrait: false,
    });
    await this.repo.markBorn(id, stored.id);
    // Mesma recompensa por fixação que `CrossService.execute()` já dava
    // (aura alta rende catalisadores/biomassa) — só que agora no NASCIMENTO,
    // que é quando o espécime de fato passa a existir.
    await this.wallet.rewardForCross(ownerId, entry.aura).catch(() => {});
    return { specimen: stored };
  }

  /**
   * POST /incubator/:id/freeze (ADR-0020, item 6) — só revelada e não
   * nascida; cobra catalisadores (mesmo valor do freezeOption antigo,
   * `FREEZE_COST`). Congelada continua podendo nascer (grátis) depois.
   */
  async freeze(id: string, ownerId: string): Promise<{ entry: IncubatorEntryView; wallet: Awaited<ReturnType<WalletService["get"]>> }> {
    const entry = await this.getOwned(id, ownerId);
    if (entry.revealedAt === null) throw new BadRequestException("Revele antes de congelar.");
    if (entry.bornSpecimenId) throw new BadRequestException("Esta descrição já nasceu.");
    if (!entry.frozen) {
      await this.wallet.charge(ownerId, FREEZE_COST);
      await this.repo.markFrozen(id);
    }
    const updated = (await this.repo.get(id))!;
    let imageUrl: string | null = null;
    if (updated.imageCacheKey) { const st = await stat(updated.imageCacheKey); if (st) imageUrl = publicUrl(updated.imageCacheKey, st.version); }
    return { entry: this.toView(updated, imageUrl), wallet: await this.wallet.get(ownerId) };
  }

  /** DELETE /api/v1/incubator/:id — descarta a entrada. Só a web avisa antes; a API só executa. */
  async discard(id: string, ownerId: string): Promise<void> {
    await this.getOwned(id, ownerId);
    await this.repo.delete(id);
  }
}
