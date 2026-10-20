-- Roteiro ↔ post: linked_to aponta o roteiro para o post que o realizou; dismissed_at tira da fila de atrasados;
-- created_by guarda quem (cliente) cadastrou o roteiro pelo portal.
ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS linked_to uuid;
ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;
ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS created_by uuid;
