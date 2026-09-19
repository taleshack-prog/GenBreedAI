CREATE TABLE IF NOT EXISTS "referral_pack_purchases" (
	"payment_id" text PRIMARY KEY NOT NULL,
	"referred_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_pack_trios" (
	"referred_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"trios_paid" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "referral_pack_trios_referred_id_pack_id_pk" PRIMARY KEY("referred_id","pack_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_pack_purchases_referred_pack_idx" ON "referral_pack_purchases" USING btree ("referred_id","pack_id");