-- 0029: publicar pelo KBOS (fase 3). Contas das redes (token criptografado), arquivos finais do post e
-- dados de envio por publicação. Só acrescenta.
CREATE TABLE IF NOT EXISTS kbos_social_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid REFERENCES kbos_projects(id) ON DELETE SET NULL,
 network text NOT NULL,
 external_id text NOT NULL,
 page_id text,
 name text NOT NULL,
 username text,
 picture_url text,
 token_enc text NOT NULL,
 token_expires_at timestamptz,
 status text NOT NULL DEFAULT 'ativo',
 last_error text,
 connected_by uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kbos_social_accounts_uq ON kbos_social_accounts(network, external_id);
CREATE TABLE IF NOT EXISTS kbos_post_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES kbos_social_posts(id) ON DELETE CASCADE,
 position integer NOT NULL DEFAULT 0,
 kind text NOT NULL,
 mime text NOT NULL,
 name text NOT NULL,
 size bigint NOT NULL DEFAULT 0,
 expected_size bigint NOT NULL DEFAULT 0,
 public_token text NOT NULL,
 status text NOT NULL DEFAULT 'enviando',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kbos_post_media_token_uq ON kbos_post_media(public_token);
CREATE INDEX IF NOT EXISTS kbos_post_media_post_idx ON kbos_post_media(post_id, position);
ALTER TABLE kbos_post_publications ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES kbos_social_accounts(id) ON DELETE SET NULL;
ALTER TABLE kbos_post_publications ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE kbos_post_publications ADD COLUMN IF NOT EXISTS sending_at timestamptz;
