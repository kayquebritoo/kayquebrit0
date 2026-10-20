CREATE TABLE IF NOT EXISTS kbos_social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES kbos_projects(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL,
  brand text,
  title text NOT NULL,
  format text NOT NULL DEFAULT 'outro',
  networks jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'roteiro',
  script text,
  caption text,
  media_url text,
  external_key text UNIQUE,
  copies integer NOT NULL DEFAULT 1,
  client_note text,
  decided_at timestamptz,
  decided_by uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
  posted_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kbos_social_posts_project_idx ON kbos_social_posts (project_id, scheduled_at);
