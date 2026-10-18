// Migrações idempotentes aplicadas no boot do servidor (instrumentation.ts)
// e sob demanda em `POST /api/admin/migrate`. Cada passo usa IF NOT EXISTS,
// então rodar de novo é inofensivo. Espelho em `drizzle/0010_*.sql`.
//
// Por que no boot: o deploy da VPS não roda `drizzle-kit push`, e código novo
// que lê colunas novas quebraria até alguém migrar à mão.
import { sql } from "drizzle-orm";
import { db } from "./db";

export const SCHEMA_STEPS: { id: string; sql: string }[] = [
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
