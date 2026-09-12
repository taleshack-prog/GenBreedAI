import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { InMemoryUserRepository } from "../src/auth/user.repository";

describe("Auth (e-mail + senha + JWT)", () => {
  let auth: AuthService;
  beforeEach(() => { process.env.AUTH_SECRET = "test-secret"; auth = new AuthService(new InMemoryUserRepository()); });

  it("registra e emite JWT válido", async () => {
    const r = await auth.register("a@b.com", "senha12345", "Ana");
    expect(r.token).toBeTruthy();
    expect(r.user.email).toBe("a@b.com");
    expect(r.user.tier).toBe("FREE");
    const p = auth.verify(r.token);
    expect(p.sub).toBe(r.user.id);
  });
  it("rejeita e-mail inválido e senha curta", async () => {
    await expect(auth.register("xx", "senha12345")).rejects.toThrow(/E-mail/);
    await expect(auth.register("a@b.com", "123")).rejects.toThrow(/senha/);
  });
  it("não permite e-mail duplicado", async () => {
    await auth.register("a@b.com", "senha12345");
    await expect(auth.register("a@b.com", "outrasenha")).rejects.toThrow(/já está cadastrado/);
  });
  it("login correto e incorreto", async () => {
    await auth.register("a@b.com", "senha12345");
    const ok = await auth.login("a@b.com", "senha12345");
    expect(ok.token).toBeTruthy();
    await expect(auth.login("a@b.com", "errada")).rejects.toThrow(/inválidos/);
  });
  it("me() retorna o usuário do id", async () => {
    const r = await auth.register("a@b.com", "senha12345", "Ana");
    const me = await auth.me(r.user.id);
    expect(me?.email).toBe("a@b.com");
  });
});
