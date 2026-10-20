ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS facebook text;
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS extra_emails jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS former_phones jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS external_ids jsonb NOT NULL DEFAULT '{}'::jsonb;
