ALTER TYPE "public"."kbos_budget_status" ADD VALUE 'completed';--> statement-breakpoint
ALTER TYPE "public"."kbos_budget_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "kbos_budgets" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "kbos_budgets" ADD COLUMN "client_company" text;--> statement-breakpoint
ALTER TABLE "kbos_budgets" ADD COLUMN "event_dates" jsonb;--> statement-breakpoint
ALTER TABLE "kbos_budgets" ADD COLUMN "discount_type" text;--> statement-breakpoint
ALTER TABLE "kbos_budgets" ADD COLUMN "discount_value" numeric;
