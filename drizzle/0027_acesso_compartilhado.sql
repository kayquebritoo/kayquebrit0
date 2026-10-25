-- Acesso compartilhado: outras pessoas do cliente veem o projeto no portal (além do cliente_id).
CREATE TABLE IF NOT EXISTS kbos_project_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES kbos_projects(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES kbos_users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kbos_project_members_uq ON kbos_project_members(project_id, user_id);
CREATE INDEX IF NOT EXISTS kbos_project_members_user_idx ON kbos_project_members(user_id);
