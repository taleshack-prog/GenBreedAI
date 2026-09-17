/**
 * Controller POST /api/v1/cross (ADR-0020 — incubadora).
 * Cruzar é LIVRE e sem custo: enumera até N descrições de fenótipo (sem
 * imagem) e grava cada uma na incubadora; NÃO cria espécime, NÃO consome
 * cota de revelação. Só guard: `QuotaGuard`, agora só o limite TÉCNICO
 * anti-abuso (60/hora, todo tier, ADR-0020) — não mais a cota de cruzamento
 * por tier (essa virou `revealQuota`, cobrada em `POST /incubator/:id/reveal`).
 * Ordem: AuthGuard (identidade) → QuotaGuard (limite horário).
 * 201 Created | 400 Bad Request | 401 Unauthorized | 429 Too Many Requests.
 */

import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { QuotaGuard, type CrossReservedRequest } from "../quota/quota.guard";
import { QuotaService } from "../quota/quota.service";
import { TierService } from "../billing/tier.service";
import { CrossService } from "./cross.service";
import { CrossDto } from "./dto/cross.dto";
import { IncubatorRepository } from "../incubator/in-memory.repository";

@Controller("api/v1/cross")
export class CrossController {
  constructor(
    private readonly service: CrossService,
    private readonly tier: TierService,
    private readonly quota: QuotaService,
    private readonly incubator: IncubatorRepository,
  ) {}

  @Post()
  @UseGuards(AuthGuard, QuotaGuard)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrossDto, @Req() req: CrossReservedRequest) {
    const tier = await this.tier.resolve(user.id, user.tier);
    // QuotaGuard já reservou 1 unidade do limite HORÁRIO (QuotaService.reserve,
    // kind "cross_hourly", atômico) e deixou o id em req.crossReservationId.
    // Sucesso → confirma (permanente); falha → estorna (apaga a reserva) —
    // cruzar sendo livre, isto é só proteção técnica, não cota de jogo.
    const reservationId = req.crossReservationId!;
    try {
      const { crossId, sireId, damId, method, pack, species, entries } = await this.service.incubate(user.id, tier, dto);
      const created = await Promise.all(entries.map((e) => this.incubator.create({
        ownerId: user.id, crossId, sireId, damId, method,
        pack: pack as "feline" | "canine", species,
        genotype: e.genotype, phenotype: e.phenotype, prob: e.prob,
        fPedigree: e.fPedigree, fixationIndex: e.fixationIndex, aura: e.aura, generation: e.generation,
        sex: e.sex, fertility: e.fertility, haldaneStatus: e.haldaneStatus,
      })));
      await this.quota.confirm("cross_hourly", reservationId);
      return { crossId, entries: created };
    } catch (e) {
      await this.quota.release("cross_hourly", reservationId);
      throw e;
    }
  }

  @Post("options")
  @UseGuards(AuthGuard)
  async options(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrossDto) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.service.options(tier, dto);
  }

  @Post("classify")
  @UseGuards(AuthGuard)
  classify(@Body() dto: { sireId: string; damId: string }) {
    return this.service.classify(dto);
  }
}
