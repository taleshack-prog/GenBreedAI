/**
 * Criopreservação (Gene Bank — TDD §1.3/§7). Congelar (custa Catalisadores) uma
 * OPÇÃO de prole não sintetizada ou um ESPÉCIME existente; descongelar (custa
 * Biomassa) materializa para uso como progenitor. Anti-P2W: custo por operação.
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Genotype, Tier } from "@genbreedai/shared";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import { CrossService } from "../cross/cross.service";
import { WalletService, FREEZE_COST, THAW_COST } from "../economy/wallet.service";
import type { Wallet } from "../economy/wallet.repository";
import type { CrossDto } from "../cross/dto/cross.dto";
import { FREEZE_COST as FC } from "../economy/wallet.service";

@Injectable()
export class GeneBankService {
  constructor(
    private readonly repo: SpecimenRepository,
    private readonly cross: CrossService,
    private readonly wallet: WalletService,
  ) {}

  /** Congela uma OPÇÃO de prole (genótipo escolhido no seletor), sem sintetizar. */
  async freezeOption(owner: string, tier: Tier, dto: CrossDto): Promise<{ specimen: StoredSpecimen; wallet: Wallet }> {
    const { result, sire, dam, species, pack } = await this.cross.computeResult(tier, dto);
    await this.wallet.charge(owner, FREEZE_COST);
    const stored = await this.repo.save({
      id: "", ownerId: owner, pack: pack as "feline" | "canine", species,
      genotype: result.specimen.genotype as Genotype, generation: result.specimen.generation,
      sireId: sire.id, damId: dam.id, method: dto.method,
      fPedigree: result.specimen.fPedigree, fixationIndex: result.specimen.fixationIndex,
      aura: result.specimen.aura, cacheKey: result.cacheKey, status: "FROZEN",
    });
    return { specimen: stored, wallet: await this.wallet.get(owner) };
  }

  /** Congela um ESPÉCIME já existente. */
  async freezeSpecimen(owner: string, id: string) {
    const s = await this.repo.get(id);
    if (!s) throw new NotFoundException(`Espécime ${id} não encontrado.`);
    if (s.status === "FROZEN") throw new BadRequestException("Já está congelado.");
    await this.wallet.charge(owner, FREEZE_COST);
    const updated = await this.repo.save({ ...s, status: "FROZEN" });
    return { specimen: updated, wallet: await this.wallet.get(owner) };
  }

  /** Descongela: materializa para uso (custa Biomassa/síntese). */
  async thaw(owner: string, id: string) {
    const s = await this.repo.get(id);
    if (!s) throw new NotFoundException(`Espécime ${id} não encontrado.`);
    if (s.status !== "FROZEN") throw new BadRequestException("Não está congelado.");
    await this.wallet.charge(owner, THAW_COST);
    const updated = await this.repo.save({ ...s, status: "ALIVE" });
    return { specimen: updated, wallet: await this.wallet.get(owner) };
  }

  /**
   * Sintetiza a opção ESCOLHIDA (materializa, status ALIVE) e CONGELA as demais
   * opções informadas — resolve a dor de perder fenótipos não usados. Cada
   * congelamento debita Catalisadores; se acabar o saldo, congela os que couberem
   * e informa quantos ficaram. A síntese sempre acontece.
   */
  async synthesizeAndFreeze(
    owner: string, tier: import("@genbreedai/shared").Tier,
    dto: CrossDto, freezeKeys: string[],
  ): Promise<{ specimen: StoredSpecimen; frozen: StoredSpecimen[]; frozenCount: number; skipped: number; wallet: Wallet }> {
    // 1) materializa o escolhido (ALIVE) — reusa o fluxo de cruzamento
    const synth = await this.cross.execute(owner, tier, dto);
    // 2) congela os demais (um por um; para quando faltar saldo)
    const frozen: StoredSpecimen[] = [];
    let skipped = 0;
    for (const key of freezeKeys) {
      if (key === dto.choiceKey) continue;
      const wallet = await this.wallet.get(owner);
      if ((FC.catalisadores ?? 0) > wallet.catalisadores) { skipped++; continue; }
      try {
        const r = await this.freezeOption(owner, tier, { ...dto, choiceKey: key });
        frozen.push(r.specimen);
      } catch { skipped++; }
    }
    return { specimen: synth.specimen, frozen, frozenCount: frozen.length, skipped, wallet: await this.wallet.get(owner) };
  }
}
