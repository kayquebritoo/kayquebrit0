-- Plano do projeto: quantos posts por mês (null = padrão da categoria, 0 = sem limite).
ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS post_limit integer;
