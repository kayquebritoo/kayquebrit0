CREATE TABLE IF NOT EXISTS kbos_services (
 slug text PRIMARY KEY,
 label text,
 tagline text,
 description text,
 price_from numeric,
 term text,
 includes jsonb,
 pitch jsonb,
 process jsonb,
 active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
