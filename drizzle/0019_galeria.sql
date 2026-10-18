CREATE TABLE IF NOT EXISTS kbos_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  title text NOT NULL,
  brand text NOT NULL DEFAULT '',
  event_date text,
  status text NOT NULL DEFAULT 'draft',
  expires_at timestamptz,
  contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kbos_album_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES kbos_albums(id) ON DELETE CASCADE,
  name text NOT NULL,
  width integer,
  height integer,
  taken_at timestamptz,
  downloads integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kbos_album_photos_album_idx ON kbos_album_photos(album_id);
CREATE TABLE IF NOT EXISTS kbos_album_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES kbos_albums(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES kbos_album_photos(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_phone text NOT NULL,
  consent_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  user_agent text,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS kbos_album_auth_photo_idx ON kbos_album_authorizations(photo_id);
