ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pf';
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS document text;
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS legal_name text;
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS state_registration text;
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS role text;
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS address text;
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS city text;
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS state text;
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS zip_code text;
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS website text;
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS instagram text;
--> statement-breakpoint
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS source text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS kbos_contacts_document_idx ON kbos_contacts (document);
--> statement-breakpoint
ALTER TABLE kbos_conversations ADD COLUMN IF NOT EXISTS title text;
--> statement-breakpoint
ALTER TABLE kbos_conversations ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE kbos_conversations ADD COLUMN IF NOT EXISTS last_preview text;
--> statement-breakpoint
ALTER TABLE kbos_messages ADD COLUMN IF NOT EXISTS sender_name text;
--> statement-breakpoint
ALTER TABLE kbos_messages ADD COLUMN IF NOT EXISTS sender_phone text;
--> statement-breakpoint
ALTER TYPE kbos_message_type ADD VALUE IF NOT EXISTS 'video';
--> statement-breakpoint
ALTER TABLE kbos_transactions ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'empresa';
--> statement-breakpoint
ALTER TABLE kbos_transactions ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE kbos_transactions ADD COLUMN IF NOT EXISTS payment_method text;
--> statement-breakpoint
ALTER TABLE kbos_transactions ADD COLUMN IF NOT EXISTS recurrence text;
--> statement-breakpoint
ALTER TABLE kbos_transactions ADD COLUMN IF NOT EXISTS notes text;
--> statement-breakpoint
ALTER TABLE kbos_budgets ADD COLUMN IF NOT EXISTS client_document text;
--> statement-breakpoint
UPDATE kbos_conversations SET is_group = true, contact_id = NULL WHERE channel_chat_id LIKE '%@g.us' AND (is_group = false OR contact_id IS NOT NULL);
