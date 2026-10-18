ALTER TABLE kbos_auth_challenges ALTER COLUMN user_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE kbos_auth_challenges ADD COLUMN IF NOT EXISTS registration jsonb;
--> statement-breakpoint
ALTER TABLE kbos_auth_challenges ADD COLUMN IF NOT EXISTS destination text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS kbos_auth_pending_destination ON kbos_auth_challenges(destination) WHERE consumed=false;
