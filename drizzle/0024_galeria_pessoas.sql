-- Autorização por pessoa na galeria: um aceite libera todo o álbum. A selfie é só prova de quem aceitou.
CREATE TABLE IF NOT EXISTS kbos_album_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES kbos_albums(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  is_minor boolean NOT NULL DEFAULT false,
  guardian_name text,
  selfie text,
  consent_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  user_agent text,
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS kbos_album_guests_active_uq ON kbos_album_guests(album_id, phone) WHERE revoked_at IS NULL;
