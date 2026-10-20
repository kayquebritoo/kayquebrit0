CREATE TABLE IF NOT EXISTS kbos_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES kbos_projects(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES kbos_users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kbos_chat_messages_project_idx ON kbos_chat_messages (project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS kbos_chat_reads (
  project_id uuid NOT NULL REFERENCES kbos_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES kbos_users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
