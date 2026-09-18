/**
 * "Cadastrou" (ADR-0024) DENTRO do fluxo de registro — server-side, nunca por
 * rota pública. O cadastro NÃO credita nada (sem verificação de e-mail seria
 * farmável): só GRAVA o vínculo indicador → indicado, que é o que permite
 * pagar quando o indicado assina. Cobre: vínculo gravado 1x; nenhum crédito;
 * auto-indicação (mesmo e-mail e alias) não vincula; ref inválido/erro interno
 * nunca quebra o cadastro; Google só vincula usuário NOVO.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { InMemoryUserRepository } from "../src/auth/user.repository";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import type { ReferralService } from "../src/referral/referral.service";
import { makeReferralStack } from "./helpers/referral";

describe("Cadastro com código de indicação", () => {
  let auth: AuthService; let wallet: WalletService; let referral: ReferralService;
  let savedGoogleClientId: string | undefined;
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret";
    savedGoogleClientId = process.env.GOOGLE_CLIENT_ID;
    wallet = new WalletService(new InMemoryWalletRepository());
    ({ referral } = makeReferralStack(wallet));
    auth = new AuthService(new InMemoryUserRepository(), referral);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (savedGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = savedGoogleClientId;
  });

  const credits = async (id: string) => (await wallet.get(id)).imageCredits ?? 0;
  /** Assinar JUNIOR paga 15 ao indicador SE (e só se) o vínculo foi gravado no cadastro. */
  const paidOnSubscribe = async (referredId: string) => (await referral.recordConversion(referredId, { id: `sub_${referredId}`, tier: "JUNIOR" })).credited;

  async function alice(email = "alice@exemplo.com") {
    const a = await auth.register(email, "senha12345", "Alice");
    const link = await referral.getOrCreateLink(a.user.id);
    return { id: a.user.id, code: link.code as string };
  }

  it("cadastro com ref válido GRAVA o vínculo (1x) e NÃO credita nada", async () => {
    const a = await alice();
    const b = await auth.register("bob@exemplo.com", "senha12345", "Bob", a.code);
    expect(b.token).toBeTruthy();
    expect(await credits(a.id)).toBe(0);
    const link = await referral.getOrCreateLink(a.id);
    expect(link.installs).toBe(1); // contador informativo
    expect(link.creditsEarned).toBe(0);
    // o vínculo existe: quando bob ASSINAR, alice é paga (JUNIOR = 15)
    expect(await paidOnSubscribe(b.user.id)).toBe(15);
    expect(await credits(a.id)).toBe(15);
    // repetir o cadastro com o mesmo e-mail é recusado → nenhum vínculo/crédito extra
    await expect(auth.register("bob@exemplo.com", "senha12345", "Bob", a.code)).rejects.toThrow(/já está cadastrado/);
    expect((await referral.getOrCreateLink(a.id)).installs).toBe(1);
  });

  it("cadastro SEM ref não vincula: assinar não paga ninguém", async () => {
    const a = await alice();
    const b = await auth.register("bob@exemplo.com", "senha12345");
    expect(await credits(a.id)).toBe(0);
    expect(await paidOnSubscribe(b.user.id)).toBe(0);
  });

  it("auto-indicação por alias do MESMO e-mail (+tag / pontos do Gmail) não vincula", async () => {
    const a = await alice("alice@gmail.com");
    const b = await auth.register("a.lice+promo@gmail.com", "senha12345", "Alice 2", a.code);
    const c = await auth.register("alice+outra@gmail.com", "senha12345", "Alice 3", a.code);
    expect((await referral.getOrCreateLink(a.id)).installs).toBe(0);
    expect(await paidOnSubscribe(b.user.id)).toBe(0);
    expect(await paidOnSubscribe(c.user.id)).toBe(0);
    expect(await credits(a.id)).toBe(0);
  });

  it("ref inválido (inexistente, formato ruim, tipo errado, vazio) não quebra o cadastro e não vincula", async () => {
    const a = await alice();
    const bads: unknown[] = ["nao-existe", "!!", "", "x".repeat(200), 123, undefined];
    for (const [i, bad] of bads.entries()) {
      const r = await auth.register(`u${i}@exemplo.com`, "senha12345", undefined, bad as string | undefined);
      expect(r.token).toBeTruthy();
      expect(await paidOnSubscribe(r.user.id)).toBe(0);
    }
    expect((await referral.getOrCreateLink(a.id)).installs).toBe(0);
    expect(await credits(a.id)).toBe(0);
  });

  it("erro INTERNO ao vincular (ex.: banco) não quebra o cadastro", async () => {
    const a = await alice();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(referral, "linkReferred").mockRejectedValueOnce(new Error("db caiu"));
    const b = await auth.register("bob@exemplo.com", "senha12345", "Bob", a.code);
    expect(b.token).toBeTruthy();
    expect(err).toHaveBeenCalled();
  });

  it("Google: usuário NOVO com ref vincula 1x (sem crédito); login de conta EXISTENTE com ref não vincula de novo", async () => {
    process.env.GOOGLE_CLIENT_ID = "cid";
    const a = await alice();
    const verify = vi.fn().mockResolvedValue({ getPayload: () => ({ sub: "g-1", email: "gabi@exemplo.com", name: "Gabi" }) });
    (auth as unknown as { googleClient: { verifyIdToken: typeof verify } }).googleClient = { verifyIdToken: verify };

    const first = await auth.google("tok", a.code); // cria a conta
    expect(await credits(a.id)).toBe(0);
    expect((await referral.getOrCreateLink(a.id)).installs).toBe(1);
    await auth.google("tok", a.code); // login de conta que já existe
    expect((await referral.getOrCreateLink(a.id)).installs).toBe(1);
    expect(await paidOnSubscribe(first.user.id)).toBe(15);
  });
});
