import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";
import { AuthGuard, CurrentUser, type AuthenticatedUser } from "../common/auth.guard";

@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() b: { email: string; password: string; name?: string }) {
    return this.auth.register(b.email, b.password, b.name);
  }
  @Post("login")
  login(@Body() b: { email: string; password: string }) {
    return this.auth.login(b.email, b.password);
  }
  @Post("google")
  google(@Body() b: { idToken: string }) {
    return this.auth.google(b.idToken);
  }
  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}
