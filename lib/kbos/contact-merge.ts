import { sql } from "drizzle-orm";
import { db } from "./db";

/** Junta `removeId` em `keepId` numa única instrução (atômica no Neon HTTP):
 * leva projetos, tarefas, lançamentos, negócios, conversas, orçamentos, cases e envios de campanha
 * para o contato que fica, completa os campos vazios dele e ARQUIVA o outro (sem apagar, sem telefone,
 * com nota de onde foi parar). */
export async function mergeContacts(keepId: string, removeId: string) {
  if (keepId === removeId) throw new Error("Escolha dois contatos diferentes.");
  const res = await db().execute(sql`
    WITH
    p AS (UPDATE kbos_projects SET contact_id = ${keepId} WHERE contact_id = ${removeId} RETURNING 1),
    t AS (UPDATE kbos_tasks SET contact_id = ${keepId} WHERE contact_id = ${removeId} RETURNING 1),
    tr AS (UPDATE kbos_transactions SET contact_id = ${keepId} WHERE contact_id = ${removeId} RETURNING 1),
    d AS (UPDATE kbos_deals SET contact_id = ${keepId} WHERE contact_id = ${removeId} RETURNING 1),
    cv AS (UPDATE kbos_conversations SET contact_id = ${keepId} WHERE contact_id = ${removeId} RETURNING 1),
    cl AS (UPDATE kbos_campaign_logs SET contact_id = ${keepId} WHERE contact_id = ${removeId} RETURNING 1),
    b AS (UPDATE kbos_budgets SET contact_id = ${keepId} WHERE contact_id = ${removeId} RETURNING 1),
    s AS (UPDATE kbos_showcases SET contact_id = ${keepId} WHERE contact_id = ${removeId} RETURNING 1),
    k AS (
      UPDATE kbos_contacts c SET
        email = coalesce(c.email, r.email), phone = coalesce(c.phone, r.phone), company = coalesce(c.company, r.company),
        document = coalesce(c.document, r.document), legal_name = coalesce(c.legal_name, r.legal_name),
        state_registration = coalesce(c.state_registration, r.state_registration), role = coalesce(c.role, r.role),
        address = coalesce(c.address, r.address), city = coalesce(c.city, r.city), state = coalesce(c.state, r.state),
        zip_code = coalesce(c.zip_code, r.zip_code), website = coalesce(c.website, r.website),
        instagram = coalesce(c.instagram, r.instagram), source = coalesce(c.source, r.source),
        marketing_opt_out_at = coalesce(c.marketing_opt_out_at, r.marketing_opt_out_at),
        status = CASE WHEN r.status = 'client' AND c.status <> 'client' THEN 'client'::kbos_contact_status ELSE c.status END,
        notes = nullif(trim(both E'\n' from coalesce(c.notes, '') || CASE WHEN r.notes IS NOT NULL AND r.notes <> '' THEN E'\n' || r.notes ELSE '' END), '')
      FROM kbos_contacts r WHERE c.id = ${keepId} AND r.id = ${removeId} RETURNING 1
    ),
    a AS (
      UPDATE kbos_contacts SET status = 'archived', phone = NULL,
        notes = trim(both E'\n' from coalesce(notes, '') || E'\nMesclado em outro contato (duplicado).')
      WHERE id = ${removeId} RETURNING 1
    )
    SELECT (SELECT count(*) FROM k)::int AS kept, (SELECT count(*) FROM a)::int AS archived`);
  const row = res.rows[0] as { kept: number; archived: number } | undefined;
  if (!row || row.kept !== 1 || row.archived !== 1) throw new Error("Contato não encontrado.");
  return row;
}
