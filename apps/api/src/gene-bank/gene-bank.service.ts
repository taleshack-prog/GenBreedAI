/**
 * Criopreservação (Gene Bank — TDD §1.3/§7). Congelar (custa Catalisadores) uma
 * OPÇÃO de prole não sintetizada ou um ESPÉCIME existente; descongelar (custa
 * Biomassa) materializa para uso como progenitor. Anti-P2W: custo por operação.
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Tier } from "@genbreedai/shared";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import { CrossService } from "../cross/cross.service";
import { WalletService, FREEZE_COST, THAW_COST } from "../economy/wallet.service";
import type { Wallet } from "../economy/wallet.repository";
import type { CrossDto } from "../cross/dto/cross.dto";
import { specimenVisibleAtTier } from "../common/tier-access";

@Injectable()
export class GeneBankService {
  constructor(
    private readonly repo: SpecimenRepository,
    private readonly cross: CrossService,
    private readonly wallet: WalletService,
  ) {}

  /** Congela um ESPÉCIME já existente. */
  async freezeSpecimen(owner: string, tier: Tier, id: string) {
    const s = await this.repo.get(id);
    if (!s) throw new NotFoundException(`Espécime ${id} não encontrado.`);
    // Pool de espécie (ADR-0016): fora do pool do tier = 404, como se não existisse.
    if (!specimenVisibleAtTier(tier, s.pack, s.species)) throw new NotFoundException(`Espécime ${id} não encontrado.`);
    if (s.status === "FROZEN") throw new BadRequestException("Já está congelado.");
    await this.wallet.charge(owner, FREEZE_COST);
    const updated = await this.repo.save({ ...s, status: "FROZEN" });
    return { specimen: updated, wallet: await this.wallet.get(owner) };
  }

  /** Descongela: materializa para uso (custa Biomassa/síntese). */
  async thaw(owner: string, tier: Tier, id: string) {
    const s = await this.repo.get(id);
    if (!s) throw new NotFoundException(`Espécime ${id} não encontrado.`);
    if (!specimenVisibleAtTier(tier, s.pack, s.species)) throw new NotFoundException(`Espécime ${id} não encontrado.`);
    if (s.status !== "FROZEN") throw new BadRequestException("Não está congelado.");
    await this.wallet.charge(owner, THAW_COST);
    const updated = await this.repo.save({ ...s, status: "ALIVE" });
    return { specimen: updated, wallet: await this.wallet.get(owner) };
  }

  /**
   * Sintetiza a opção ESCOLHIDA (materializa, status ALIVE).
   *
   * ÓRFÃO (ADR-0020, item 9): "congela as demais opções informadas"
   * (`freezeKeys`) foi REMOVIDO — dependia de `freezeOption` (congelar uma
   * opção NÃO sintetizada, pagando catalisadores só pra "reservar" o
   * genótipo), que não existe mais: toda descrição enumerada por um
   * cruzamento já fica de graça na incubadora (`POST /cross`, ADR-0020),
   * sem precisar congelar nada pra não perder. `freezeKeys` continua no
   * parâmetro (evita mudar a assinatura/DTO agora — a web ainda manda esse
   * campo) mas é IGNORADO; `frozen`/`skipped` sempre saem vazios/zero. Este
   * fluxo inteiro (POST gene-bank/synthesize) tende a ser substituído pelo
   * par incubadora "revelar" + "nascer" quando a web for atualizada (prompt
   * seguinte) — mantido funcionando aqui só pra não quebrar o build.
   */
  async synthesizeAndFreeze(
    owner: string, tier: import("@genbreedai/shared").Tier,
    dto: CrossDto, freezeKeys: string[],
  ): Promise<{ specimen: StoredSpecimen; frozen: StoredSpecimen[]; frozenCount: number; skipped: number; wallet: Wallet }> {
    void freezeKeys; // ver ÓRFÃO acima
    const synth = await this.cross.execute(owner, tier, dto);
    return { specimen: synth.specimen, frozen: [], frozenCount: 0, skipped: 0, wallet: await this.wallet.get(owner) };
  }
}
