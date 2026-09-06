CREATE TABLE IF NOT EXISTS "crosses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sire_id" text NOT NULL,
	"dam_id" text NOT NULL,
	"method" text NOT NULL,
	"seed" text NOT NULL,
	"result_specimen_id" text NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specimens" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"pack" text NOT NULL,
	"species" text NOT NULL,
	"genotype" jsonb NOT NULL,
	"phenotype" jsonb,
	"generation" integer DEFAULT 0 NOT NULL,
	"sire_id" text,
	"dam_id" text,
	"method" text NOT NULL,
	"f_pedigree" double precision DEFAULT 0 NOT NULL,
	"fixation_index" double precision DEFAULT 0 NOT NULL,
	"aura" integer DEFAULT 1 NOT NULL,
	"cache_key" text,
	"provenance_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"tier" text DEFAULT 'FREE' NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
