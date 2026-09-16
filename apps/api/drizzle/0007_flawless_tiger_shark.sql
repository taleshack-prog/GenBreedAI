ALTER TABLE "specimens" ADD COLUMN "sex" text;--> statement-breakpoint
ALTER TABLE "specimens" ADD COLUMN "fertility" double precision;--> statement-breakpoint
ALTER TABLE "specimens" ADD COLUMN "haldane_status" text;--> statement-breakpoint
ALTER TABLE "specimens" ADD CONSTRAINT "specimens_sex_check" CHECK ("specimens"."sex" IS NULL OR "specimens"."sex" IN ('M','F'));--> statement-breakpoint
ALTER TABLE "specimens" ADD CONSTRAINT "specimens_fertility_check" CHECK ("specimens"."fertility" IS NULL OR ("specimens"."fertility" >= 0 AND "specimens"."fertility" <= 100));--> statement-breakpoint
ALTER TABLE "specimens" ADD CONSTRAINT "specimens_haldane_status_check" CHECK ("specimens"."haldane_status" IS NULL OR "specimens"."haldane_status" IN ('NONE','STERILE','REDUCED'));