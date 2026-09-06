/**
 * Imagens do espécime (TDD §5 / §8-ampliado).
 *  POST /api/v1/specimens/:id/image  → gera (ou retorna cache).
 *  GET  /api/v1/specimens/:id/image  → status/url do cache.
 */
import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";
import { ImageService } from "./image.service";

@Controller("api/v1/specimens/:id/image")
export class ImageController {
  constructor(private readonly images: ImageService) {}

  @Post()
  @UseGuards(AuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.images.generate(id, user.tier);
  }

  @Get()
  @UseGuards(AuthGuard)
  status(@Param("id") id: string) {
    return this.images.getCached(id);
  }
}
