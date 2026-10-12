CREATE TYPE "public"."kbos_campaign_status" AS ENUM('draft', 'scheduled', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."kbos_campaign_log_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "kbos_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"message_template" text NOT NULL,
	"status" "kbos_campaign_status" DEFAULT 'draft' NOT NULL,
	"target_status" text DEFAULT 'all' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_campaign_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid,
	"status" "kbos_campaign_log_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "kbos_campaign_logs" ADD CONSTRAINT "kbos_campaign_logs_campaign_id_kbos_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."kbos_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_campaign_logs" ADD CONSTRAINT "kbos_campaign_logs_contact_id_kbos_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."kbos_contacts"("id") ON DELETE set null ON UPDATE no action;
