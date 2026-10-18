ALTER TABLE kbos_budgets ADD COLUMN IF NOT EXISTS upload_bytes integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS kbos_budget_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 budget_id uuid NOT NULL REFERENCES kbos_budgets(id) ON DELETE CASCADE,
 name text NOT NULL,
 mime text NOT NULL,
 size integer NOT NULL CHECK (size > 0 AND size <= 10485760),
 sha256 text NOT NULL,
 content bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kbos_budget_uploads_budget_idx ON kbos_budget_uploads(budget_id);
