/**
 * Imagens do espécime (TDD §5 / §8-ampliado).
 *  POST /api/v1/specimens/:id/image  → gera (ou retorna cache).
 *  GET  /api/v1/specimens/:id/image  → status/url do cache.
 */
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { ImageService } from "./image.service";
import { ImageQuotaService, monthlyImageLimit } from "../economy/image-quota.service";

@Controller("api/v1/specimens/:id/image")
export class ImageController {
  constructor(private readonly images: ImageService) {}

  @Post()
  @UseGuards(AuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: { force?: boolean }) {
    return this.images.generate(id, user.tier, body?.force === true);
  }

  @Get()
  @UseGuards(AuthGuard)
  status(@Param("id") id: string) {
    return this.images.getCached(id);
  }
}

@Controller("api/v1/image-quota")
export class ImageQuotaController {
  constructor(private readonly quota: ImageQuotaService) {}
  @Get()
  @UseGuards(AuthGuard)
  async get(@CurrentUser() user: AuthenticatedUser) {
    return { limit: monthlyImageLimit(user.tier), used: await this.quota.used(user.id), remaining: await this.quota.remaining(user.id, user.tier) };
  }
}
