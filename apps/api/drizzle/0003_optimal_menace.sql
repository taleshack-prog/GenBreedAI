CREATE TABLE IF NOT EXISTS "image_quota" (
	"owner_id" text NOT NULL,
	"ym" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "image_quota_owner_id_ym_pk" PRIMARY KEY("owner_id","ym")
);
