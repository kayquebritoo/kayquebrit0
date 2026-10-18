ALTER TABLE kbos_budget_sales ADD COLUMN IF NOT EXISTS company_profile jsonb;
--> statement-breakpoint
ALTER TABLE kbos_budget_uploads ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS kbos_client_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sale_id uuid NOT NULL UNIQUE REFERENCES kbos_budget_sales(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL UNIQUE REFERENCES kbos_projects(id) ON DELETE CASCADE,
 share_token_hash text UNIQUE,
 signed_profile jsonb NOT NULL,
 draft jsonb NOT NULL,
 draft_revision integer NOT NULL DEFAULT 1,
 published jsonb,
 version integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'draft',
 feedback jsonb NOT NULL DEFAULT '[]'::jsonb,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
