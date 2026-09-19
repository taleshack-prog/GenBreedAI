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
  timestamp, primaryKey, boolean, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  /**
   * ADR-0025 — instante da PRIMEIRA gestação da conta (cortesia de boas-vindas
   * de 5 min). Gravado uma única vez (UPDATE ... WHERE first_gestation_at IS
   * NULL) e nunca mais alterado; NULL = a cortesia ainda está disponível.
   * Vive no usuário (não se deduz das entradas da incubadora: elas somem —
   * nascida em 7 dias, ADR-0023; descartada é apagada).
   */
  firstGestationAt: timestamp("first_gestation_at", { withTimezone: true }),
  /**
   * ADR-0025 — id da entrada da incubadora que foi a 1ª gestação. Sem FK de
   * propósito (a entrada some, nascida em 7 dias/descartada). Gravado junto de
   * `first_gestation_at` no mesmo UPDATE. É ISTO que identifica "qual entrada
   * foi a acelerada": comparar timestamps não serve (duas gestações no mesmo
   * milissegundo ficariam ambas marcadas).
   */
  firstGestationEntryId: text("first_gestation_entry_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Espécimes (TDD §3). Genótipo/fenótipo em JSONB; proveniência e linhagem.
 *
 * `sex`/`fertility`/`haldaneStatus` (ADR-0015, sexo/fertilidade/Haldane):
 * colunas ADITIVAS e ANULÁVEIS — nenhum registro legado (pré-ADR-0015) tem
 * esses dados, então ficam NULL até uma migração de dados EXPLÍCITA (dry-run
 * primeiro) os preencher; nenhuma linha existente é alterada por esta
 * migração de schema. `genotype` (JSONB) já carrega sexo cromossômico via
 * `xLoci` quando aplicável — estas colunas são metadados de PARENTAL
 * (resultado do gate de fertilidade/Haldane no momento do cruzamento), não
 * duplicam o genótipo.
 */
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
  sex: text("sex"), // "M" | "F" | null — legado fica NULL até migração de dados explícita
  fertility: doublePrecision("fertility"), // 0–100 | null — idem
  haldaneStatus: text("haldane_status"), // "NONE" | "STERILE" | "REDUCED" | null — idem
  /**
   * ADR-0019: todo espécime nascido de cruzamento já tem direito a UM
   * retrato de IA sem custo (nem cota, nem crédito) — este campo é esse
   * "vale" ainda não usado. `true` só na criação via cruzamento (nunca em
   * fundador); vira `false` no primeiro retrato gerado (automático após o
   * cruzamento OU o 1º pedido manual, o que vier primeiro) — sempre por
   * `UPDATE ... WHERE included_portrait = true RETURNING` (atômico, nunca
   * concede duas vezes). Legado (pré-ADR-0019): `false` por padrão — nunca
   * inventa um retrato de graça que a linha não tinha antes desta coluna
   * existir.
   */
  includedPortrait: boolean("included_portrait").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sexCheck: check("specimens_sex_check", sql`${t.sex} IS NULL OR ${t.sex} IN ('M','F')`),
  fertilityCheck: check("specimens_fertility_check", sql`${t.fertility} IS NULL OR (${t.fertility} >= 0 AND ${t.fertility} <= 100)`),
  haldaneStatusCheck: check("specimens_haldane_status_check", sql`${t.haldaneStatus} IS NULL OR ${t.haldaneStatus} IN ('NONE','STERILE','REDUCED')`),
}));

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

/**
 * Fábrica de tabela de reservas atômicas (mesma forma, dois usos
 * independentes — ADR-0020, ver quota.service.ts): `RESERVED` = criada pelo
 * QuotaGuard/QuotaService ANTES da operação rodar; `CONFIRMED` = operação
 * concluiu com sucesso (nunca mais expira). Falha → a linha é APAGADA
 * (estorno), nunca fica como `RESERVED` órfã. `RESERVED` com mais de 10
 * minutos (processo morto entre reservar e confirmar/apagar) não conta pra
 * ninguém — checado por `created_at` na hora de contar, nunca por um job de
 * limpeza (nenhuma linha "errada" precisa ser apagada por segundo processo;
 * só deixa de ser CONTADA).
 */
function reservationsTable(name: string) {
  return pgTable(name, {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull(), // "RESERVED" | "CONFIRMED"
  }, (t) => ({
    statusCheck: check(`${name}_status_check`, sql`${t.status} IN ('RESERVED','CONFIRMED')`),
    ownerCreatedIdx: index(`${name}_owner_created_idx`).on(t.ownerId, t.createdAt),
  }));
}

/**
 * Reservas do limite TÉCNICO horário de POST /cross (ADR-0020 — 60/hora,
 * anti-abuso, igual pra todo tier). Tabela e nome INALTERADOS desde a
 * ADR-0019 (não precisa migração): só o SIGNIFICADO mudou — antes contava a
 * cota de cruzamento por tier (rolling7d/day), agora conta só o teto técnico
 * por hora (ver `quota.service.ts`, kind "cross_hourly").
 */
export const crossReservations = reservationsTable("cross_reservations");

/**
 * Reservas da cota de GESTAÇÃO por tier (ADR-0021 — rolling7d/day, mesmos
 * valores/janelas que a ADR-0020 tinha pra "revelar"; só o alvo mudou de
 * "revelar uma descrição" pra "iniciar a gestação de uma descrição" — o
 * único custo real é a imagem gerada no NASCIMENTO, então o limite fica na
 * gestação, o passo que efetivamente compromete essa imagem). Tabela
 * RENOMEADA de `reveal_reservations` (ADR-0020) — reportar pra `db:generate`
 * gerar a migração de rename. Contador independente do limite horário de
 * cruzamento acima (`quota.service.ts`, kind "birth").
 */
export const birthReservations = reservationsTable("birth_reservations");

/**
 * Incubadora (ADR-0020, campos de gestação adicionados na ADR-0021): toda
 * descrição de fenótipo enumerada por um cruzamento (livre/ilimitado) vira
 * uma linha aqui — SEM imagem, sem custo, sem prazo, até GESTAR. Campos
 * ALÉM da lista literal pedida (`sireId`/`damId`/`method`/`pack`/`species`/
 * `fPedigree`/`fixationIndex`/`generation`/`fertility`/`haldaneStatus`) são
 * necessários pra "nascer" NUNCA recalcular nada — sem eles não dá pra
 * montar um `StoredSpecimen` válido só com o que a lista original tinha
 * (genotype/phenotype/prob/aura/sex).
 * `crossId` NÃO é FK pra outra tabela — é só um id de correlação, o MESMO em
 * toda linha gerada pelo mesmo POST /cross (pra UI agrupar "essas N vieram
 * do mesmo cruzamento"); a tabela `crosses` (legada, nunca chegou a ser
 * escrita) não serve pra isso porque `resultSpecimenId` é NOT NULL (exige um
 * espécime já existente, incompatível com "cruzar não cria espécime" desta
 * ADR) — deliberadamente não reaproveitada aqui.
 */
export const incubatorEntries = pgTable("incubator_entries", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  crossId: text("cross_id").notNull(),
  sireId: text("sire_id").notNull(),
  damId: text("dam_id").notNull(),
  method: text("method").notNull(),
  pack: text("pack").notNull(), // "canine" | "feline"
  species: text("species").notNull(),
  genotype: jsonb("genotype").$type<Genotype>().notNull(),
  phenotype: jsonb("phenotype").$type<Phenotype>().notNull(),
  prob: doublePrecision("prob").notNull(),
  fPedigree: doublePrecision("f_pedigree").notNull().default(0),
  fixationIndex: doublePrecision("fixation_index").notNull().default(0),
  aura: integer("aura").notNull(),
  generation: integer("generation").notNull().default(0),
  sex: text("sex").notNull(), // "M" | "F" — ADR-0020: sexo é sorteado na INCUBAÇÃO, não mais só na síntese
  fertility: doublePrecision("fertility"), // 0–100 | null (ADR-0015, mesma regra de specimens.fertility)
  haldaneStatus: text("haldane_status"), // "NONE" | "STERILE" | "REDUCED" | null
  /**
   * Gestação (ADR-0021). Ambas NULL = "na incubadora" (estado inicial, livre,
   * sem prazo). `gestationStartedAt` preenchido = vaga consumida (atômico,
   * ver `claimGestation` no repositório); `gestationEndsAt` = início + horas
   * pela aura da entrada (`gestation-time.ts`). NASCER exige
   * `gestationEndsAt` já passado — antes disso, 400 com o tempo restante.
   */
  gestationStartedAt: timestamp("gestation_started_at", { withTimezone: true }),
  gestationEndsAt: timestamp("gestation_ends_at", { withTimezone: true }),
  bornSpecimenId: text("born_specimen_id"),
  /**
   * ADR-0021 item 5: `frozen`/`markFrozen()` ficam ÓRFÃOS por este PR — a
   * única rota que os escrevia (`POST /:id/freeze`) foi removida junto com
   * "revelar" avulso, e não existe mais opção de "congelar" no modelo de
   * gestação. Mantidos aqui (não listados no item 5 como candidatos a sair,
   * ao contrário de `imageCacheKey`/`revealedAt`) — reportado no resumo pra
   * decisão explícita de remover ou não numa próxima rodada.
   */
  frozen: boolean("frozen").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sexCheck: check("incubator_entries_sex_check", sql`${t.sex} IN ('M','F')`),
  fertilityCheck: check("incubator_entries_fertility_check", sql`${t.fertility} IS NULL OR (${t.fertility} >= 0 AND ${t.fertility} <= 100)`),
  haldaneStatusCheck: check("incubator_entries_haldane_status_check", sql`${t.haldaneStatus} IS NULL OR ${t.haldaneStatus} IN ('NONE','STERILE','REDUCED')`),
  ownerCreatedIdx: index("incubator_entries_owner_created_idx").on(t.ownerId, t.createdAt),
}));

export type DbSchema = {
  users: typeof users;
  specimens: typeof specimens;
  crosses: typeof crosses;
  crossReservations: typeof crossReservations;
  birthReservations: typeof birthReservations;
  incubatorEntries: typeof incubatorEntries;
};

/** Carteira de recursos por usuário (economia — TDD §7). */
export const wallets = pgTable("wallets", {
  ownerId: text("owner_id").primaryKey(),
  catalisadores: integer("catalisadores").notNull().default(12450),
  biomassa: integer("biomassa").notNull().default(125480),
  lastDaily: text("last_daily"),
  /**
   * Última data (YYYY-MM-DD) em que o bônus QUINZENAL de crédito (1 crédito
   * = 1 nascimento extra) foi resgatado (ADR-0021 — era `lastWeekly`/`last_weekly`, semanal, ADR-
   * 0019; renomeado pra não sugerir semana sob a nova janela de 15 dias
   * corridos). Comparação é por TIMESTAMP/rolling-window em `wallet.service.ts`
   * (`claimBiweekly`), não por igualdade de bucket calendário como o antigo
   * `weekKey()` — 15 não divide um calendário em buckets limpos.
   */
  lastBiweekly: text("last_biweekly"),
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
