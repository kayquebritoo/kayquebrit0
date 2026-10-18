CREATE TABLE IF NOT EXISTS kbos_budget_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL UNIQUE REFERENCES kbos_budgets(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  budget_version timestamptz NOT NULL,
  snapshot jsonb NOT NULL,
  plan jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  signer_name text,
  contract_accepted boolean NOT NULL DEFAULT false,
  manual_accepted boolean NOT NULL DEFAULT false,
  project_id uuid REFERENCES kbos_projects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
