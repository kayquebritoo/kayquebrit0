// Migrações idempotentes aplicadas no boot do servidor (instrumentation.ts)
// e sob demanda em `POST /api/admin/migrate`. Cada passo usa IF NOT EXISTS,
// então rodar de novo é inofensivo. Espelho em `drizzle/0010_*.sql`.
//
// Por que no boot: o deploy da VPS não roda `drizzle-kit push`, e código novo
// que lê colunas novas quebraria até alguém migrar à mão.
import { sql } from "drizzle-orm";
import { db } from "./db";

export const SCHEMA_STEPS: { id: string; sql: string }[] = [
  { id: "gallery.0", sql: `CREATE TABLE IF NOT EXISTS kbos_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  title text NOT NULL,
  brand text NOT NULL DEFAULT '',
  event_date text,
  status text NOT NULL DEFAULT 'draft',
  expires_at timestamptz,
  contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)` },
  { id: "gallery.1", sql: `CREATE TABLE IF NOT EXISTS kbos_album_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES kbos_albums(id) ON DELETE CASCADE,
  name text NOT NULL,
  width integer,
  height integer,
  taken_at timestamptz,
  downloads integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
)` },
  { id: "gallery.2", sql: `CREATE INDEX IF NOT EXISTS kbos_album_photos_album_idx ON kbos_album_photos(album_id)` },
  { id: "gallery.3", sql: `CREATE TABLE IF NOT EXISTS kbos_album_authorizations (
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
)` },
  { id: "gallery.4", sql: `CREATE INDEX IF NOT EXISTS kbos_album_auth_photo_idx ON kbos_album_authorizations(photo_id)` },
  { id: "gallery.5", sql: `CREATE TABLE IF NOT EXISTS kbos_album_guests (
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
)` },
  { id: "gallery.6", sql: `CREATE UNIQUE INDEX IF NOT EXISTS kbos_album_guests_active_uq ON kbos_album_guests(album_id, phone) WHERE revoked_at IS NULL` },
  { id: "conteudo.6", sql: `ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS linked_to uuid` },
  { id: "conteudo.7", sql: `ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS dismissed_at timestamptz` },
  { id: "projects.post_limit", sql: `ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS post_limit integer` },
  { id: "conteudo.8", sql: `ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS created_by uuid` },
  { id: "contacts.optout.0", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS marketing_opt_out_at timestamptz` },
  { id: "sales.uploads.0", sql: `ALTER TABLE kbos_budgets ADD COLUMN IF NOT EXISTS upload_bytes integer NOT NULL DEFAULT 0` },
  { id: "sales.uploads.1", sql: `CREATE TABLE IF NOT EXISTS kbos_budget_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 budget_id uuid NOT NULL REFERENCES kbos_budgets(id) ON DELETE CASCADE,
 name text NOT NULL,
 mime text NOT NULL,
 size integer NOT NULL CHECK (size > 0 AND size <= 10485760),
 sha256 text NOT NULL,
 content bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
)` },
  { id: "sales.uploads.2", sql: `CREATE INDEX IF NOT EXISTS kbos_budget_uploads_budget_idx ON kbos_budget_uploads(budget_id)` },
  { id: "sales.table", sql: `CREATE TABLE IF NOT EXISTS kbos_budget_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL UNIQUE REFERENCES kbos_budgets(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  budget_version timestamptz NOT NULL,
  snapshot jsonb NOT NULL,
  plan jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  signer_name text,
  contract_accepted boolean NOT NULL DEFAULT false,
  manual_accepted boolean NOT NULL DEFAULT false,
  project_id uuid REFERENCES kbos_projects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
)` },
  // ── 0010 · cadastro completo de contatos (PF/PJ, CNPJ/CPF, endereço)
  { id: "contacts.kind", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pf'` },
  { id: "contacts.document", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS document text` },
  { id: "contacts.legal_name", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS legal_name text` },
  { id: "contacts.state_registration", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS state_registration text` },
  { id: "contacts.role", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS role text` },
  { id: "contacts.address", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS address text` },
  { id: "contacts.city", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS city text` },
  { id: "contacts.state", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS state text` },
  { id: "contacts.zip_code", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS zip_code text` },
  { id: "contacts.website", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS website text` },
  { id: "contacts.instagram", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS instagram text` },
  { id: "contacts.source", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS source text` },
  { id: "contacts.document_idx", sql: `CREATE INDEX IF NOT EXISTS kbos_contacts_document_idx ON kbos_contacts (document)` },
  // ── 0010 · inbox: grupos com título próprio e autor por mensagem
  { id: "conversations.title", sql: `ALTER TABLE kbos_conversations ADD COLUMN IF NOT EXISTS title text` },
  { id: "conversations.is_group", sql: `ALTER TABLE kbos_conversations ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false` },
  { id: "conversations.last_preview", sql: `ALTER TABLE kbos_conversations ADD COLUMN IF NOT EXISTS last_preview text` },
  { id: "messages.sender_name", sql: `ALTER TABLE kbos_messages ADD COLUMN IF NOT EXISTS sender_name text` },
  { id: "messages.sender_phone", sql: `ALTER TABLE kbos_messages ADD COLUMN IF NOT EXISTS sender_phone text` },
  { id: "message_type.video", sql: `ALTER TYPE kbos_message_type ADD VALUE IF NOT EXISTS 'video'` },
  // ── 0010 · financeiro: empresa × pessoal, vínculo com cliente, forma de pagamento
  { id: "transactions.scope", sql: `ALTER TABLE kbos_transactions ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'empresa'` },
  { id: "transactions.contact_id", sql: `ALTER TABLE kbos_transactions ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL` },
  { id: "transactions.payment_method", sql: `ALTER TABLE kbos_transactions ADD COLUMN IF NOT EXISTS payment_method text` },
  { id: "transactions.recurrence", sql: `ALTER TABLE kbos_transactions ADD COLUMN IF NOT EXISTS recurrence text` },
  { id: "transactions.notes", sql: `ALTER TABLE kbos_transactions ADD COLUMN IF NOT EXISTS notes text` },
  // ── 0010 · orçamento: documento do cliente no contrato
  { id: "budgets.client_document", sql: `ALTER TABLE kbos_budgets ADD COLUMN IF NOT EXISTS client_document text` },
  // ── 0011 · tarefas de verdade: prazo, responsável, avulsas ou no projeto
  { id: "tasks.project_optional", sql: `ALTER TABLE kbos_tasks ALTER COLUMN project_id DROP NOT NULL` },
  { id: "tasks.due_at", sql: `ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS due_at timestamptz` },
  { id: "tasks.description", sql: `ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS description text` },
  { id: "tasks.assignee", sql: `ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS assignee text` },
  { id: "tasks.priority", sql: `ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'` },
  { id: "tasks.contact_id", sql: `ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL` },
  { id: "tasks.done_at", sql: `ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS done_at timestamptz` },
  { id: "tasks.updated_at", sql: `ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()` },
  { id: "tasks.due_idx", sql: `CREATE INDEX IF NOT EXISTS kbos_tasks_due_idx ON kbos_tasks (due_at)` },
  // ── 0011 · projeto ligado ao contato do CRM e ao orçamento que o originou
  { id: "projects.contact_id", sql: `ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL` },
  { id: "projects.budget_id", sql: `ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS budget_id uuid REFERENCES kbos_budgets(id) ON DELETE SET NULL` },
  // ── 0010 · grupos que já entraram: marca como grupo e solta do contato errado
  {
    id: "conversations.mark_groups",
    sql: `UPDATE kbos_conversations SET is_group = true, contact_id = NULL WHERE channel_chat_id LIKE '%@g.us' AND (is_group = false OR contact_id IS NOT NULL)`,
  },
  { id: "sales.company_profile", sql: `ALTER TABLE kbos_budget_sales ADD COLUMN IF NOT EXISTS company_profile jsonb` },
  { id: "uploads.source", sql: `ALTER TABLE kbos_budget_uploads ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin'` },
  { id: "plans.table", sql: `CREATE TABLE IF NOT EXISTS kbos_client_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sale_id uuid NOT NULL UNIQUE REFERENCES kbos_budget_sales(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL UNIQUE REFERENCES kbos_projects(id) ON DELETE CASCADE,
 share_token_hash text UNIQUE,
 signed_profile jsonb NOT NULL,
 draft jsonb NOT NULL,
 draft_revision integer NOT NULL DEFAULT 1,
 published jsonb,
 version integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'draft',
 feedback jsonb NOT NULL DEFAULT '[]'::jsonb,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
)` },

  { id: "auth.simple.0", sql: `ALTER TABLE kbos_users ADD COLUMN IF NOT EXISTS username text` },
  { id: "auth.simple.1", sql: `ALTER TABLE kbos_users ADD COLUMN IF NOT EXISTS auth_code_requested_at timestamptz` },
  { id: "auth.simple.2", sql: `CREATE UNIQUE INDEX IF NOT EXISTS kbos_users_username_unique ON kbos_users(lower(username))` },
  { id: "auth.simple.3", sql: `ALTER TABLE kbos_users ADD COLUMN IF NOT EXISTS google_subject text` },
  { id: "auth.simple.4", sql: `CREATE UNIQUE INDEX IF NOT EXISTS kbos_users_google_subject_unique ON kbos_users(google_subject)` },
  { id: "auth.simple.5", sql: `CREATE TABLE IF NOT EXISTS kbos_auth_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES kbos_users(id) ON DELETE CASCADE,
 code_hash text NOT NULL,
 channel text NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 consumed boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
)` },

  { id: "catalogo.0", sql: `CREATE TABLE IF NOT EXISTS kbos_services (
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
)` },

  { id: "cases.0", sql: `CREATE TABLE IF NOT EXISTS kbos_showcases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE,
 project_id uuid REFERENCES kbos_projects(id) ON DELETE SET NULL,
 contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'draft',
 basis text NOT NULL DEFAULT 'consent',
 service text NOT NULL DEFAULT 'audiovisual',
 title text NOT NULL,
 category text,
 client_name text,
 client_logo text,
 year text,
 description text,
 long_description text,
 about jsonb,
 img text,
 gallery jsonb,
 video_label text,
 video_id text,
 site_url text,
 metrics text,
 testimonial text,
 testimonial_author text,
 content_hash text,
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
)` },

  { id: "cases.1", sql: `CREATE TABLE IF NOT EXISTS kbos_showcase_consents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 showcase_id uuid NOT NULL REFERENCES kbos_showcases(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending',
 requested_scopes jsonb NOT NULL,
 granted_scopes jsonb,
 snapshot jsonb NOT NULL,
 content_hash text NOT NULL,
 signer_name text,
 expires_at timestamptz NOT NULL,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
)` },

  { id: "cases.2", sql: `CREATE INDEX IF NOT EXISTS kbos_showcase_consents_showcase_idx ON kbos_showcase_consents (showcase_id, created_at DESC)` },
  { id: "contatos.import.0", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS facebook text` },
  { id: "contatos.import.1", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS photo_url text` },
  { id: "contatos.import.2", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS extra_emails jsonb NOT NULL DEFAULT '[]'::jsonb` },
  { id: "contatos.import.3", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS former_phones jsonb NOT NULL DEFAULT '[]'::jsonb` },
  { id: "contatos.import.4", sql: `ALTER TABLE kbos_contacts ADD COLUMN IF NOT EXISTS external_ids jsonb NOT NULL DEFAULT '{}'::jsonb` },
  { id: "chat.0", sql: `CREATE TABLE IF NOT EXISTS kbos_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES kbos_projects(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES kbos_users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)` },
  { id: "chat.1", sql: `CREATE INDEX IF NOT EXISTS kbos_chat_messages_project_idx ON kbos_chat_messages (project_id, created_at DESC)` },
  { id: "chat.2", sql: `CREATE TABLE IF NOT EXISTS kbos_chat_reads (
  project_id uuid NOT NULL REFERENCES kbos_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES kbos_users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
)` },
  { id: "conteudo.0", sql: `CREATE TABLE IF NOT EXISTS kbos_social_posts (
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
)` },
  { id: "conteudo.1", sql: `CREATE INDEX IF NOT EXISTS kbos_social_posts_project_idx ON kbos_social_posts (project_id, scheduled_at)` },
  { id: "conteudo.2", sql: `ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS script_by text` },
  { id: "conteudo.3", sql: `ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS capture_by text` },
  { id: "conteudo.4", sql: `ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS editor text` },
  { id: "conteudo.5", sql: `ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS error_message text` },
  { id: "projects.members.0", sql: `CREATE TABLE IF NOT EXISTS kbos_project_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES kbos_projects(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES kbos_users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
)` },
  { id: "projects.members.1", sql: `CREATE UNIQUE INDEX IF NOT EXISTS kbos_project_members_uq ON kbos_project_members(project_id, user_id)` },
  { id: "projects.members.2", sql: `CREATE INDEX IF NOT EXISTS kbos_project_members_user_idx ON kbos_project_members(user_id)` },
  { id: "conteudo.ciclos.0", sql: `ALTER TABLE kbos_project_members ADD COLUMN IF NOT EXISTS access text NOT NULL DEFAULT 'acompanhar'` },
  { id: "conteudo.ciclos.1", sql: `ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS recurring boolean NOT NULL DEFAULT false` },
  { id: "conteudo.ciclos.2", sql: `ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES kbos_projects(id) ON DELETE SET NULL` },
  { id: "conteudo.ciclos.3", sql: `CREATE INDEX IF NOT EXISTS kbos_projects_parent_idx ON kbos_projects(parent_id)` },
  { id: "conteudo.ciclos.4", sql: `ALTER TABLE kbos_social_posts ADD COLUMN IF NOT EXISTS takes jsonb NOT NULL DEFAULT '[]'::jsonb` },
  { id: "conteudo.ciclos.5", sql: `CREATE TABLE IF NOT EXISTS kbos_post_publications (
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
)` },
  { id: "conteudo.ciclos.6", sql: `CREATE UNIQUE INDEX IF NOT EXISTS kbos_post_publications_uq ON kbos_post_publications(post_id, network)` },
  { id: "conteudo.ciclos.7", sql: `CREATE TABLE IF NOT EXISTS kbos_project_cycles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES kbos_projects(id) ON DELETE CASCADE,
 month text NOT NULL,
 status text NOT NULL DEFAULT 'aberto',
 summary jsonb,
 note text,
 closed_at timestamptz,
 closed_by uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
)` },
  { id: "conteudo.ciclos.8", sql: `CREATE UNIQUE INDEX IF NOT EXISTS kbos_project_cycles_uq ON kbos_project_cycles(project_id, month)` },
  { id: "conteudo.ciclos.9", sql: `CREATE TABLE IF NOT EXISTS kbos_data_moves (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL,
 payload jsonb NOT NULL,
 created_by uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 reverted_at timestamptz
)` },
  { id: "redes.publicar.0", sql: `CREATE TABLE IF NOT EXISTS kbos_social_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid REFERENCES kbos_projects(id) ON DELETE SET NULL,
 network text NOT NULL,
 external_id text NOT NULL,
 page_id text,
 name text NOT NULL,
 username text,
 picture_url text,
 token_enc text NOT NULL,
 token_expires_at timestamptz,
 status text NOT NULL DEFAULT 'ativo',
 last_error text,
 connected_by uuid REFERENCES kbos_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
)` },
  { id: "redes.publicar.1", sql: `CREATE UNIQUE INDEX IF NOT EXISTS kbos_social_accounts_uq ON kbos_social_accounts(network, external_id)` },
  { id: "redes.publicar.2", sql: `CREATE TABLE IF NOT EXISTS kbos_post_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES kbos_social_posts(id) ON DELETE CASCADE,
 position integer NOT NULL DEFAULT 0,
 kind text NOT NULL,
 mime text NOT NULL,
 name text NOT NULL,
 size bigint NOT NULL DEFAULT 0,
 expected_size bigint NOT NULL DEFAULT 0,
 public_token text NOT NULL,
 status text NOT NULL DEFAULT 'enviando',
 created_at timestamptz NOT NULL DEFAULT now()
)` },
  { id: "redes.publicar.3", sql: `CREATE UNIQUE INDEX IF NOT EXISTS kbos_post_media_token_uq ON kbos_post_media(public_token)` },
  { id: "redes.publicar.4", sql: `CREATE INDEX IF NOT EXISTS kbos_post_media_post_idx ON kbos_post_media(post_id, position)` },
  { id: "redes.publicar.5", sql: `ALTER TABLE kbos_post_publications ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES kbos_social_accounts(id) ON DELETE SET NULL` },
  { id: "redes.publicar.6", sql: `ALTER TABLE kbos_post_publications ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0` },
  { id: "redes.publicar.7", sql: `ALTER TABLE kbos_post_publications ADD COLUMN IF NOT EXISTS sending_at timestamptz` },
];

/**
 * Contatos-fantasma criados por mensagens de grupo (um por mensagem!) e que
 * não têm nada ligado a eles. Só roda via endpoint, nunca no boot.
 */
export const CLEANUP_GROUP_CONTACTS = `
DELETE FROM kbos_contacts c
WHERE c.notes LIKE 'Criado automaticamente via inbox (%@g.us).'
  AND NOT EXISTS (SELECT 1 FROM kbos_conversations v WHERE v.contact_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM kbos_deals d WHERE d.contact_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM kbos_budgets b WHERE b.contact_id = c.id)
RETURNING c.id`;

let applied: Promise<{ ok: string[]; failed: { id: string; error: string }[] }> | null = null;

export function ensureSchema(force = false) {
  if (applied && !force) return applied;
  applied = (async () => {
    const ok: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const step of SCHEMA_STEPS) {
      try {
        await db().execute(sql.raw(step.sql));
        ok.push(step.id);
      } catch (e) {
        failed.push({ id: step.id, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
      }
    }
    if (failed.length) console.error("[kbos] migração com falhas:", failed);
    return { ok, failed };
  })();
  return applied;
}
