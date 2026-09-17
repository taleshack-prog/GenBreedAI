/**
 * Imagens do espécime (TDD §5 / §8-ampliado; ADR-0019 — retrato incluído).
 *  POST /api/v1/specimens/:id/image  → gera (ou retorna cache).
 *  GET  /api/v1/specimens/:id/image  → status/url do cache.
 */
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { TierService } from "../billing/tier.service";
import { ImageService } from "./image.service";
import { ImageQuotaService, monthlyImageLimit } from "../economy/image-quota.service";

@Controller("api/v1/specimens/:id/image")
export class ImageController {
  constructor(private readonly images: ImageService, private readonly tier: TierService) {}

  @Post()
  @UseGuards(AuthGuard)
  async create(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: { force?: boolean }) {
    const tier = await this.tier.resolve(user.id, user.tier);
    const force = body?.force === true;
    // Retrato incluído no cruzamento (ADR-0019): só quando NÃO é force
    // (regenerar nunca usa o retrato incluído — item explícito da regra) e
    // o espécime é do usuário (claimIncludedPortrait já checa isso; nunca
    // bate pra fundador, que é sempre dono "demo"). Reivindicação atômica —
    // se `null`, cai pra regra normal (cota mensal → crédito → 403).
    if (!force) {
      const claimed = await this.images.claimIncludedPortrait(id, user.id);
      if (claimed) return this.images.generateForSpecimen(claimed, user.id, tier, true);
    }
    return this.images.generate(id, user.id, tier, force);
  }

  @Get()
  @UseGuards(AuthGuard)
  async status(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const tier = await this.tier.resolve(user.id, user.tier);
    return this.images.getCached(id, user.id, tier);
  }
}

@Controller("api/v1/image-quota")
export class ImageQuotaController {
  constructor(private readonly quota: ImageQuotaService, private readonly tierService: TierService) {}
  @Get()
  @UseGuards(AuthGuard)
  async get(@CurrentUser() user: AuthenticatedUser) {
    const tier = await this.tierService.resolve(user.id, user.tier);
    return { limit: monthlyImageLimit(tier), used: await this.quota.used(user.id), remaining: await this.quota.remaining(user.id, tier) };
  }
}
