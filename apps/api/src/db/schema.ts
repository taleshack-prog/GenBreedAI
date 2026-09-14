/**
 * Schema Drizzle (PostgreSQL) — Fase 1b. Modelo do TDD §3 (subconjunto que o
 * fluxo de cruzamento persiste). Genoma e fenótipo em JSONB (TDD §2/§3).
 *
 * Driver-agnóstico: o mesmo schema roda sob `pg` (Neon/local nativo) e sob
 * PGlite (testes). Ver ADR-0006.
 */

import {
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp, primaryKey, boolean } from "drizzle-orm/pg-core";
import type { Genotype, Phenotype } from "@genbreedai/shared";

/** Usuários (TDD §3). Campos sensíveis de auth ficam na integração Auth.js. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  googleId: text("google_id"),
  tier: text("tier").notNull().default("FREE"),
  streak: integer("streak").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Espécimes (TDD §3). Genótipo/fenótipo em JSONB; proveniência e linhagem. */
export const specimens = pgTable("specimens", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  pack: text("pack").notNull(), // "canine" | "feline"
  species: text("species").notNull(),
  genotype: jsonb("genotype").$type<Genotype>().notNull(),
  phenotype: jsonb("phenotype").$type<Phenotype>(),
  generation: integer("generation").notNull().default(0),
  sireId: text("sire_id"),
  damId: text("dam_id"),
  method: text("method").notNull(),
  fPedigree: doublePrecision("f_pedigree").notNull().default(0),
  fixationIndex: doublePrecision("fixation_index").notNull().default(0),
  aura: integer("aura").notNull().default(1),
  cacheKey: text("cache_key"),
  provenanceHash: text("provenance_hash"),
  status: text("status").notNull().default("ALIVE"), // "ALIVE" | "FROZEN"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Cruzamentos (TDD §3): registro de operação do motor + proveniência. */
export const crosses = pgTable("crosses", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sireId: text("sire_id").notNull(),
  damId: text("dam_id").notNull(),
  method: text("method").notNull(),
  seed: text("seed").notNull(),
  resultSpecimenId: text("result_specimen_id").notNull(),
  cost: integer("cost").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbSchema = {
  users: typeof users;
  specimens: typeof specimens;
  crosses: typeof crosses;
};

/** Carteira de recursos por usuário (economia — TDD §7). */
export const wallets = pgTable("wallets", {
  ownerId: text("owner_id").primaryKey(),
  catalisadores: integer("catalisadores").notNull().default(12450),
  biomassa: integer("biomassa").notNull().default(125480),
  lastDaily: text("last_daily"),
  lastWeekly: text("last_weekly"),
  imageCredits: integer("image_credits").notNull().default(0),
});

/** Uso mensal de imagem IA por usuário (cota/paywall — economia). */
export const imageQuota = pgTable("image_quota", {
  ownerId: text("owner_id").notNull(),
  ym: text("ym").notNull(), // "2026-09"
  used: integer("used").notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.ownerId, t.ym] }) }));

/** Link de indicação por usuário (viralização — TDD ReferralLink). */
export const referralLinks = pgTable("referral_links", {
  ownerId: text("owner_id").primaryKey(),
  code: text("code").notNull().unique(),
  clicks: integer("clicks").notNull().default(0),
  installs: integer("installs").notNull().default(0),
  d1: integer("d1").notNull().default(0),
  d7: integer("d7").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  creditsEarned: integer("credits_earned").notNull().default(0),
});

/** Indicados por link — rastreia marcos já creditados (anti-duplo-crédito/fraude). */
export const referralReferred = pgTable("referral_referred", {
  code: text("code").notNull(),
  referredId: text("referred_id").notNull(),
  installCredited: boolean("install_credited").notNull().default(false),
  d1Credited: boolean("d1_credited").notNull().default(false),
  d7Credited: boolean("d7_credited").notNull().default(false),
  convertCredited: boolean("convert_credited").notNull().default(false),
  firstSeen: text("first_seen"),
}, (t) => ({ pk: primaryKey({ columns: [t.code, t.referredId] }) }));

/**
 * Intents de pagamento (Stripe — integração ainda inexistente). PK = id do
 * gateway (pi_... ou cs_...): permite `INSERT ... ON CONFLICT DO NOTHING`
 * como idempotência de crédito robusta a restart de container e a retries
 * de webhook (Stripe reenvia por até 3 dias). Ver billing.service.ts.
 */
export const paymentIntents = pgTable("payment_intents", {
  id: text("id").primaryKey(), // id do gateway: pi_... ou cs_...
  userId: text("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(), // "PACK" | "SUBSCRIPTION"
  packId: text("pack_id"), // preenchido quando kind = PACK
  amountBrl: numeric("amount_brl").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING | PAID | FAILED | REFUNDED
  creditedAt: timestamp("credited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx: index("payment_intents_user_id_idx").on(t.userId),
}));

/** Assinaturas Stripe (tier recorrente — PACK avulso fica em paymentIntents). */
export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(), // stripe_subscription_id
  userId: text("user_id").notNull().references(() => users.id),
  tier: text("tier").notNull(), // JUNIOR | SENIOR | PHD
  interval: text("interval").notNull(), // MONTH | YEAR
  stripeCustomerId: text("stripe_customer_id").notNull(),
  status: text("status").notNull(), // ACTIVE | PAST_DUE | CANCELED | INCOMPLETE
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx: index("subscriptions_user_id_idx").on(t.userId),
  statusIdx: index("subscriptions_status_idx").on(t.status),
}));

/**
 * Tiers concedidos fora do Stripe (ex.: prêmio de indicação eleva o tier por
 * 30 dias sem criar assinatura). Tabela separada de `subscriptions` para que
 * a expiração (`expiresAt`) seja distinguível de uma assinatura paga na
 * resolução de tier.
 */
export const grantedTiers = pgTable("granted_tiers", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tier: text("tier").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(), // ex.: "REFERRAL_PHD"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx: index("granted_tiers_user_id_idx").on(t.userId),
  expiresAtIdx: index("granted_tiers_expires_at_idx").on(t.expiresAt),
}));
