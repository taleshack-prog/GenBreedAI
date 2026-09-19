/**
 * Créditos na carteira são ATÔMICOS (`WalletRepository.addImageCredits`): o antigo `get` + `save` de
 * `creditImageCredits` perdia crédito quando dois créditos chegavam ao mesmo tempo na MESMA carteira
 * (webhooks do Stripe em paralelo, dois trios de indicação fechando juntos): ambos liam o mesmo saldo e o
 * segundo gravava por cima. Achado pelo teste "compras SIMULTÂNEAS" de referral-packs.spec.ts (esperava 4,
 * recebia 2). O adapter Drizzle usa um único `INSERT ... ON CONFLICT DO UPDATE ... image_credits + n` e não
 * roda aqui (sem Postgres nos testes); o contrato é o mesmo do adapter em memória.
 */
import { describe, it, expect } from "vitest";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository, START } from "../src/economy/wallet.repository";

const make = () => { const repo = new InMemoryWalletRepository(); return { repo, wallet: new WalletService(repo) }; };
const credits = async (w: WalletService, id: string) => (await w.get(id)).imageCredits ?? 0;

describe("creditImageCredits — atômico", () => {
  it("créditos SIMULTÂNEOS na mesma carteira somam todos (nenhuma atualização perdida)", async () => {
    const { wallet } = make();
    await Promise.all(Array.from({ length: 20 }, () => wallet.creditImageCredits("alice", 2)));
    expect(await credits(wallet, "alice")).toBe(40);
  });

  it("valores diferentes em paralelo também somam exatamente (1 + 2 + … + 10 = 55)", async () => {
    const { wallet } = make();
    await Promise.all(Array.from({ length: 10 }, (_, i) => wallet.creditImageCredits("alice", i + 1)));
    expect(await credits(wallet, "alice")).toBe(55);
  });

  it("carteiras diferentes não se misturam", async () => {
    const { wallet } = make();
    await Promise.all([
      ...Array.from({ length: 5 }, () => wallet.creditImageCredits("alice", 3)),
      ...Array.from({ length: 5 }, () => wallet.creditImageCredits("bob", 1)),
    ]);
    expect(await credits(wallet, "alice")).toBe(15);
    expect(await credits(wallet, "bob")).toBe(5);
  });

  it("devolve a carteira atualizada e cria a carteira nova com os valores iniciais", async () => {
    const { wallet } = make();
    const w = await wallet.creditImageCredits("novo", 10);
    expect(w).toMatchObject({ catalisadores: START.catalisadores, biomassa: START.biomassa, imageCredits: 10 });
    expect((await wallet.creditImageCredits("novo", 5)).imageCredits).toBe(15);
  });

  it("não mexe nos outros campos da carteira (bônus diário/quinzenal, recursos)", async () => {
    const { repo, wallet } = make();
    await repo.save("alice", { catalisadores: 7, biomassa: 9, lastDaily: "2026-09-01", lastBiweekly: "2026-09-02", imageCredits: 1 });
    await Promise.all([wallet.creditImageCredits("alice", 2), wallet.creditImageCredits("alice", 3)]);
    expect(await repo.get("alice")).toEqual({ catalisadores: 7, biomassa: 9, lastDaily: "2026-09-01", lastBiweekly: "2026-09-02", imageCredits: 6 });
  });

  it("o resultado devolvido é uma cópia (mexer nele não altera o saldo guardado)", async () => {
    const { wallet } = make();
    const w = await wallet.creditImageCredits("alice", 2);
    w.imageCredits = 999;
    expect(await credits(wallet, "alice")).toBe(2);
  });
});
