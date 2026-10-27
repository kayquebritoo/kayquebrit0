-- Empresas (marca/operação do cliente) e acesso por empresa, com revogação. Só acrescenta:
-- nada existente muda de comportamento até o admin cadastrar empresas e acessos.
CREATE TABLE IF NOT EXISTS kbos_companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 slug text NOT NULL,
 parent_id uuid REFERENCES kbos_companies(id) ON DELETE SET NULL,
 contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL,
 lume_pasta text,
 brand_plan_id uuid REFERENCES kbos_client_plans(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kbos_companies_slug_uq ON kbos_companies(slug);
CREATE TABLE IF NOT EXISTS kbos_company_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES kbos_companies(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES kbos_users(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'acompanhar',
 granted_by uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kbos_company_access_uq ON kbos_company_access(company_id, user_id);
CREATE INDEX IF NOT EXISTS kbos_company_access_user_idx ON kbos_company_access(user_id);
ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES kbos_companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS kbos_projects_company_idx ON kbos_projects(company_id);
ALTER TABLE kbos_users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
