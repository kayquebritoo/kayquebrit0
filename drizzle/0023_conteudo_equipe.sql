ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS script_by text;
ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS capture_by text;
ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS editor text;
ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS error_message text;
