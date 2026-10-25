-- 0030: conexões das redes sociais por cliente (OAuth oficial de cada rede). Só acrescenta:
-- conexões (token + refresh criptografados), link de conexão para o cliente, auditoria e colunas novas nas contas.
CREATE TABLE IF NOT EXISTS kbos_social_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL,
 project_id uuid REFERENCES kbos_projects(id) ON DELETE SET NULL,
 external_user_id text,
 name text,
 token_enc text NOT NULL,
 refresh_enc text,
 expires_at timestamptz,
 refresh_expires_at timestamptz,
 scopes text,
 status text NOT NULL DEFAULT 'ativo',
 last_error text,
 via text NOT NULL DEFAULT 'admin',
 link_id uuid,
 connected_by uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kbos_social_connections_project_idx ON kbos_social_connections(project_id);
CREATE TABLE IF NOT EXISTS kbos_social_connect_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_hash text NOT NULL,
 project_id uuid NOT NULL REFERENCES kbos_projects(id) ON DELETE CASCADE,
 created_by uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 last_used_at timestamptz,
 uses integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kbos_social_connect_links_uq ON kbos_social_connect_links(token_hash);
CREATE TABLE IF NOT EXISTS kbos_social_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 action text NOT NULL,
 provider text,
 project_id uuid REFERENCES kbos_projects(id) ON DELETE SET NULL,
 connection_id uuid,
 actor_id uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
 actor_kind text NOT NULL DEFAULT 'admin',
 ip text,
 user_agent text,
 scopes text,
 detail jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kbos_social_audit_created_idx ON kbos_social_audit(created_at);
ALTER TABLE kbos_social_accounts ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE kbos_social_accounts ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES kbos_social_connections(id) ON DELETE SET NULL;
ALTER TABLE kbos_social_accounts ALTER COLUMN token_enc DROP NOT NULL;
