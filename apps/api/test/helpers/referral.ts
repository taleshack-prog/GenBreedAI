/**
 * Monta o ReferralService com repositórios em memória (mesmo grafo que o
 * Nest resolve): TierService e ReferralService COMPARTILHAM `subs`/`grants`,
 * então uma concessão feita pelo referral é vista por `tiers.resolve()`.
 */
import { ReferralService } from "../../src/referral/referral.service";
import { WalletService } from "../../src/economy/wallet.service";
import { InMemorySubscriptionsRepository } from "../../src/billing/subscriptions.repository";
import { InMemoryGrantedTiersRepository } from "../../src/billing/granted-tiers.repository";
import { TierService } from "../../src/billing/tier.service";
import { SystemClock } from "../../src/common/clock";

export function makeReferralStack(wallet: WalletService, subs: InMemorySubscriptionsRepository = new InMemorySubscriptionsRepository()) {
  delete process.env.DATABASE_URL; // ReferralService escolhe memória vs Postgres no construtor
  const grants = new InMemoryGrantedTiersRepository();
  const tiers = new TierService(subs, grants);
  const clock = new SystemClock();
  const referral = new ReferralService(wallet, grants, tiers, clock);
  return { referral, subs, grants, tiers, clock };
}
