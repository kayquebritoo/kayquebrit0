ALTER TABLE kbos_users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE kbos_users ADD COLUMN IF NOT EXISTS auth_code_requested_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS kbos_users_username_unique ON kbos_users(lower(username));
ALTER TABLE kbos_users ADD COLUMN IF NOT EXISTS google_subject text;
CREATE UNIQUE INDEX IF NOT EXISTS kbos_users_google_subject_unique ON kbos_users(google_subject);
CREATE TABLE IF NOT EXISTS kbos_auth_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES kbos_users(id) ON DELETE CASCADE,
 code_hash text NOT NULL,
 channel text NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 consumed boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
