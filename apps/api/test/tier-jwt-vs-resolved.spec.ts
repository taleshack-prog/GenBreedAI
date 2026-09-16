/**
 * Regressão: gene-bank.controller.ts (claimDaily) e genome.controller.ts (get)
 * usavam user.tier — o tier CRAVADO no JWT no login — em vez de
 * TierService.resolve(user.id, user.tier) como todo o resto da API. Como
 * users.tier nunca é atualizado após o cadastro, isso tratava qualquer
 * conta (mesmo com granted_tiers PHD) como FREE nessas duas rotas.
 *
 * Simula exatamente esse cenário: JWT com tier FREE (o AuthenticatedUser que
 * o AuthGuard monta a partir do payload) + granted_tiers com PHD ativo pro
 * mesmo userId. O controller precisa resolver PHD, não FREE.
 */
import { describe, it, expect } from "vitest";
import type { AuthenticatedUser } from "../src/common/auth.guard";
import { TierService } from "../src/billing/tier.service";
import { InMemorySubscriptionsRepository } from "../src/billing/subscriptions.repository";
import { InMemoryGrantedTiersRepository, type GrantedTierRow } from "../src/billing/granted-tiers.repository";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { CrossService } from "../src/cross/cross.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { GeneBankController } from "../src/gene-bank/gene-bank.controller";
import { GeneBankService } from "../src/gene-bank/gene-bank.service";
import { GenomeController } from "../src/genome/genome.controller";
import { GenomeService } from "../src/genome/genome.service";

function grant(overrides: Partial<GrantedTierRow> = {}): GrantedTierRow {
  return { id: "g_1", userId: "alice", tier: "PHD", expiresAt: new Date(Date.now() + 86_400_000), reason: "TEST_PHD", ...overrides };
}
// JWT emitido no cadastro (users.tier nunca é atualizado depois) — sempre FREE.
const staleFreeJwtUser: AuthenticatedUser = { id: "alice", tier: "FREE" };

describe("gene-bank/genome usam TierService.resolve(), não user.tier do JWT", () => {
  it("claimDaily: granted_tiers PHD + JWT FREE → recompensa de PHD (600 catalisadores / 30000 biomassa), não a de FREE (80/4000)", async () => {
    const grants = new InMemoryGrantedTiersRepository();
    await grants.grant(grant());
    const tierService = new TierService(new InMemorySubscriptionsRepository(), grants);
    const wallet = new WalletService(new InMemoryWalletRepository());
    const repo = new InMemorySpecimenRepository();
    const cross = new CrossService(repo, wallet);
    const gb = new GeneBankService(repo, cross, wallet);
    const controller = new GeneBankController(gb, wallet, tierService);

    const r = await controller.claimDaily(staleFreeJwtUser);
    expect(r.claimed).toBe(true);
    expect(r.gain).toEqual({ catalisadores: 600, biomassa: 30000 });
  });

  it("genome.get: granted_tiers PHD + JWT FREE → profundidade de linhagem PHD (99), não a de FREE (2)", async () => {
    const grants = new InMemoryGrantedTiersRepository();
    await grants.grant(grant());
    const tierService = new TierService(new InMemorySubscriptionsRepository(), grants);
    const repo = new InMemorySpecimenRepository();
    const genome = new GenomeService(repo);
    const controller = new GenomeController(genome, tierService);

    const g = await controller.get(staleFreeJwtUser, "onca-pintada");
    expect(g.depth).toBe(99);
  });
});
