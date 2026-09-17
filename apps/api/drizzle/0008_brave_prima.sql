CREATE TABLE IF NOT EXISTS "cross_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "cross_reservations_status_check" CHECK ("cross_reservations"."status" IN ('RESERVED','CONFIRMED'))
);
--> statement-breakpoint
ALTER TABLE "specimens" ADD COLUMN "included_portrait" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cross_reservations_owner_created_idx" ON "cross_reservations" USING btree ("owner_id","created_at");