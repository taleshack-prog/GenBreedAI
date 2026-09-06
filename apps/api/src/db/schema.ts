/**
 * Schema Drizzle (PostgreSQL) — Fase 1b. Modelo do TDD §3 (subconjunto que o
 * fluxo de cruzamento persiste). Genoma e fenótipo em JSONB (TDD §2/§3).
 *
 * Driver-agnóstico: o mesmo schema roda sob `pg` (Neon/local nativo) e sob
 * PGlite (testes). Ver ADR-0006.
 */

import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { Genotype, Phenotype } from "@genbreedai/shared";

/** Usuários (TDD §3). Campos sensíveis de auth ficam na integração Auth.js. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
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
