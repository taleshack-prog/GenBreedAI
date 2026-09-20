ALTER TABLE "subscriptions" ADD COLUMN "expiry_notice_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payment_failed_notice_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "dropped_notice_for" timestamp with time zone;