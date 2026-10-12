CREATE TYPE "public"."kbos_contact_status" AS ENUM('lead', 'client', 'partner', 'archived');--> statement-breakpoint
CREATE TYPE "public"."kbos_deal_stage" AS ENUM('prospecting', 'proposal', 'negotiation', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "kbos_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"status" "kbos_contact_status" DEFAULT 'lead' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"contact_id" uuid,
	"stage" "kbos_deal_stage" DEFAULT 'prospecting' NOT NULL,
	"value" numeric,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kbos_deals" ADD CONSTRAINT "kbos_deals_contact_id_kbos_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."kbos_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_courses" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "kbos_projects" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "kbos_projects" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "kbos_projects" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "kbos_projects" ADD COLUMN "thumb_url" text;--> statement-breakpoint
ALTER TABLE "kbos_projects" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "kbos_projects" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "kbos_projects" ADD CONSTRAINT "kbos_projects_course_id_kbos_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."kbos_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kbos_projects_slug_unique" ON "kbos_projects" USING btree ("slug");
