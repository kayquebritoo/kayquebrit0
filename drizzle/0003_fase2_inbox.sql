CREATE TYPE "public"."kbos_conv_channel" AS ENUM('whatsapp', 'instagram', 'telegram', 'messenger', 'webchat');--> statement-breakpoint
CREATE TYPE "public"."kbos_conv_status" AS ENUM('open', 'pending', 'closed');--> statement-breakpoint
CREATE TYPE "public"."kbos_sender_type" AS ENUM('customer', 'agent', 'ai');--> statement-breakpoint
CREATE TYPE "public"."kbos_message_type" AS ENUM('text', 'image', 'audio', 'document');--> statement-breakpoint
CREATE TYPE "public"."kbos_message_status" AS ENUM('sent', 'delivered', 'read');--> statement-breakpoint
CREATE TABLE "kbos_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid,
	"channel" "kbos_conv_channel" DEFAULT 'whatsapp' NOT NULL,
	"channel_chat_id" text NOT NULL,
	"status" "kbos_conv_status" DEFAULT 'open' NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_type" "kbos_sender_type" DEFAULT 'customer' NOT NULL,
	"content" text,
	"media_url" text,
	"message_type" "kbos_message_type" DEFAULT 'text' NOT NULL,
	"status" "kbos_message_status" DEFAULT 'sent' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kbos_conversations" ADD CONSTRAINT "kbos_conversations_contact_id_kbos_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."kbos_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_messages" ADD CONSTRAINT "kbos_messages_conversation_id_kbos_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."kbos_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kbos_conversations_channel_chat_unique" ON "kbos_conversations" USING btree ("channel","channel_chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kbos_messages_external_unique" ON "kbos_messages" USING btree ("external_id");
