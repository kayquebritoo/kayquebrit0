CREATE TYPE "public"."kbos_budget_status" AS ENUM('draft', 'sent', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "kbos_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL CONSTRAINT "kbos_budgets_code_unique" UNIQUE,
	"contact_id" uuid REFERENCES "kbos_contacts"("id") ON DELETE set null,
	"title" text NOT NULL,
	"status" "kbos_budget_status" DEFAULT 'draft' NOT NULL,
	"total_amount" numeric DEFAULT '0' NOT NULL,
	"valid_until" timestamp with time zone,
	"terms" text,
	"bank_info" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
