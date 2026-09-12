CREATE TABLE IF NOT EXISTS "wallets" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"catalisadores" integer DEFAULT 12450 NOT NULL,
	"biomassa" integer DEFAULT 125480 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "specimens" ADD COLUMN "status" text DEFAULT 'ALIVE' NOT NULL;