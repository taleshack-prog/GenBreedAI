CREATE TABLE IF NOT EXISTS "incubator_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"cross_id" text NOT NULL,
	"sire_id" text NOT NULL,
	"dam_id" text NOT NULL,
	"method" text NOT NULL,
	"pack" text NOT NULL,
	"species" text NOT NULL,
	"genotype" jsonb NOT NULL,
	"phenotype" jsonb NOT NULL,
	"prob" double precision NOT NULL,
	"f_pedigree" double precision DEFAULT 0 NOT NULL,
	"fixation_index" double precision DEFAULT 0 NOT NULL,
	"aura" integer NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"sex" text NOT NULL,
	"fertility" double precision,
	"haldane_status" text,
	"image_cache_key" text,
	"revealed_at" timestamp with time zone,
	"born_specimen_id" text,
	"frozen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incubator_entries_sex_check" CHECK ("incubator_entries"."sex" IN ('M','F')),
	CONSTRAINT "incubator_entries_fertility_check" CHECK ("incubator_entries"."fertility" IS NULL OR ("incubator_entries"."fertility" >= 0 AND "incubator_entries"."fertility" <= 100)),
	CONSTRAINT "incubator_entries_haldane_status_check" CHECK ("incubator_entries"."haldane_status" IS NULL OR "incubator_entries"."haldane_status" IN ('NONE','STERILE','REDUCED'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reveal_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "reveal_reservations_status_check" CHECK ("reveal_reservations"."status" IN ('RESERVED','CONFIRMED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incubator_entries_owner_created_idx" ON "incubator_entries" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reveal_reservations_owner_created_idx" ON "reveal_reservations" USING btree ("owner_id","created_at");