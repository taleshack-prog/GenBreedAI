CREATE TABLE IF NOT EXISTS "birth_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "birth_reservations_status_check" CHECK ("birth_reservations"."status" IN ('RESERVED','CONFIRMED'))
);
--> statement-breakpoint
DROP TABLE "reveal_reservations" CASCADE;--> statement-breakpoint
ALTER TABLE "wallets" RENAME COLUMN "last_weekly" TO "last_biweekly";--> statement-breakpoint
ALTER TABLE "incubator_entries" ADD COLUMN "gestation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incubator_entries" ADD COLUMN "gestation_ends_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "birth_reservations_owner_created_idx" ON "birth_reservations" USING btree ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "incubator_entries" DROP COLUMN IF EXISTS "image_cache_key";--> statement-breakpoint
ALTER TABLE "incubator_entries" DROP COLUMN IF EXISTS "revealed_at";