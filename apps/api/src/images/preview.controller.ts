/**
 * Preview de retrato de uma OPÇÃO de prole (antes de sintetizar). Gera a foto da
 * opção escolhida (custo: 1 imagem) e a cacheia pela cacheKey do genótipo — assim,
 * ao sintetizar, o card reusa a mesma foto (sem custo extra).
 */
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { TierService } from "../billing/tier.service";
import { CrossService } from "../cross/cross.service";
import { ImageService } from "./image.service";
import type { CrossDto } from "../cross/dto/cross.dto";

@Controller("api/v1/cross/preview")
export class PreviewController {
  constructor(private readonly cross: CrossService, private readonly images: ImageService, private readonly tierService: TierService) {}

  @Post()
  @UseGuards(AuthGuard)
  async preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrossDto & { force?: boolean; sex?: "M" | "F" }) {
    const tier = await this.tierService.resolve(user.id, user.tier);
    const { pack, species, genotype } = await this.cross.resolveChoice(tier, dto);
    // Sexo OPCIONAL (Problema 2): só pra RETRATO de uma opção sex-dimórfica
    // (juba/sem juba) — nunca decide sexo de verdade, que continua sorteado
    // pela seed só na síntese (materializeCross/finalizeSpecimen). Validado
    // aqui (nunca confia em input não tipado): só "M"/"F" aceitos, senão null.
    const sex = dto.sex === "M" || dto.sex === "F" ? dto.sex : null;
    return this.images.generateForSpecimen(
      { id: "preview", ownerId: user.id, pack: pack as "feline" | "canine", species, genotype,
        generation: 0, sireId: null, damId: null, method: "FOUNDER", fPedigree: 0, fixationIndex: 0, aura: 0, cacheKey: null,
        sex, fertility: null, haldaneStatus: null },
      tier, dto.force === true,
    );
  }
}
