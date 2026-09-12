/**
 * Autenticação real: e-mail+senha (bcrypt) e Google (ID token). Emite JWT
 * assinado com AUTH_SECRET; o AuthGuard valida. Substitui o modo demo.
 */
import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { UserRepository, type UserRow } from "./user.repository";

function secret(): string { return process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me"; }
function newId(): string { return "usr_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export interface AuthResult { token: string; user: { id: string; email: string | null; name: string | null; tier: string }; }

@Injectable()
export class AuthService {
  private googleClient = new OAuth2Client();
  constructor(private readonly users: UserRepository) {}

  private sign(u: UserRow): string {
    return jwt.sign({ sub: u.id, tier: u.tier, email: u.email }, secret(), { expiresIn: "30d" });
  }
  verify(token: string): { sub: string; tier: string } {
    return jwt.verify(token, secret()) as { sub: string; tier: string };
  }
  private result(u: UserRow): AuthResult {
    return { token: this.sign(u), user: { id: u.id, email: u.email, name: u.name, tier: u.tier } };
  }

  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    email = (email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException("E-mail inválido.");
    if (!password || password.length < 8) throw new BadRequestException("A senha precisa de ao menos 8 caracteres.");
    if (await this.users.findByEmail(email)) throw new BadRequestException("Este e-mail já está cadastrado.");
    const passwordHash = await bcrypt.hash(password, 10);
    const u = await this.users.create({ id: newId(), email, name: name ?? null, passwordHash, googleId: null, tier: "FREE" });
    return this.result(u);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    email = (email ?? "").trim().toLowerCase();
    const u = await this.users.findByEmail(email);
    if (!u || !u.passwordHash) throw new UnauthorizedException("E-mail ou senha inválidos.");
    if (!(await bcrypt.compare(password, u.passwordHash))) throw new UnauthorizedException("E-mail ou senha inválidos.");
    return this.result(u);
  }

  /** Login/cadastro via Google ID token (Google Identity Services no front). */
  async google(idToken: string): Promise<AuthResult> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new BadRequestException("Login Google não configurado (defina GOOGLE_CLIENT_ID).");
    const ticket = await this.googleClient.verifyIdToken({ idToken, audience: clientId });
    const p = ticket.getPayload();
    if (!p?.sub) throw new UnauthorizedException("Token Google inválido.");
    let u = await this.users.findByGoogleId(p.sub);
    if (!u && p.email) u = await this.users.findByEmail(p.email.toLowerCase());
    if (!u) u = await this.users.create({ id: newId(), email: p.email?.toLowerCase() ?? null, name: p.name ?? null, passwordHash: null, googleId: p.sub, tier: "FREE" });
    return this.result(u);
  }

  async me(id: string): Promise<{ id: string; email: string | null; name: string | null; tier: string } | null> {
    const u = await this.users.findById(id);
    return u ? { id: u.id, email: u.email, name: u.name, tier: u.tier } : null;
  }
}
