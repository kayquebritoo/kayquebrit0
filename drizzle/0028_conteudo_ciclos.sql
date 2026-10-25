-- 0028: gestão de conteúdo pelo cliente, projetos recorrentes com ciclo mensal, publicações por rede e takes do Lume.
-- Só acrescenta (nada é apagado nem reescrito). Reverter: ver docs/PLANO-CONTEUDO.md (seção Rollback).
ALTER TABLE kbos_project_members ADD COLUMN IF NOT EXISTS access text NOT NULL DEFAULT 'acompanhar';
ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS recurring boolean NOT NULL DEFAULT false;
ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES kbos_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS kbos_projects_parent_idx ON kbos_projects(parent_id);
ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS takes jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS kbos_post_publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES kbos_social_posts(id) ON DELETE CASCADE,
 network text NOT NULL,
 status text NOT NULL DEFAULT 'pendente',
 scheduled_at timestamptz,
 published_at timestamptz,
 url text,
 external_id text,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kbos_post_publications_uq ON kbos_post_publications(post_id, network);
CREATE TABLE IF NOT EXISTS kbos_project_cycles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES kbos_projects(id) ON DELETE CASCADE,
 month text NOT NULL,
 status text NOT NULL DEFAULT 'aberto',
 summary jsonb,
 note text,
 closed_at timestamptz,
 closed_by uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kbos_project_cycles_uq ON kbos_project_cycles(project_id, month);
-- Registro de movimentações de dados (ex.: separar o Grupo VIP por operação), para desfazer.
CREATE TABLE IF NOT EXISTS kbos_data_moves (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL,
 payload jsonb NOT NULL,
 created_by uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 reverted_at timestamptz
);
