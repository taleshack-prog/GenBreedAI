CREATE TABLE IF NOT EXISTS "referral_links" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"installs" integer DEFAULT 0 NOT NULL,
	"d1" integer DEFAULT 0 NOT NULL,
	"d7" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"credits_earned" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "referral_links_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_referred" (
	"code" text NOT NULL,
	"referred_id" text NOT NULL,
	"install_credited" boolean DEFAULT false NOT NULL,
	"d1_credited" boolean DEFAULT false NOT NULL,
	"d7_credited" boolean DEFAULT false NOT NULL,
	"convert_credited" boolean DEFAULT false NOT NULL,
	"first_seen" text,
	CONSTRAINT "referral_referred_code_referred_id_pk" PRIMARY KEY("code","referred_id")
);
--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "last_weekly" text;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "image_credits" integer DEFAULT 0 NOT NULL;