-- Post em colab: outras empresas além da principal (brand). Só acrescenta.
ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS collab_brands jsonb NOT NULL DEFAULT '[]'::jsonb;
