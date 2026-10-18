import { sql } from "drizzle-orm";
import { db } from "./db";

/** Outbox no Postgres: a mesma cobrança/data/antecedência só entra uma vez.
 * O sweeper entrega ao Redis, inclusive após indisponibilidade da fila. */
export async function handleBillingReminders() {
  const result = await db().execute(sql`
    INSERT INTO kbos_jobs (tipo, payload, idempotency_key)
    SELECT 'notify.whatsapp', jsonb_build_object(
      'billingTransactionId', t.id,
      'billingDueDate', (t.vencimento AT TIME ZONE 'America/Belem')::date::text,
      'billingReminderDay', (now() AT TIME ZONE 'America/Belem')::date::text,
      'destino', CASE WHEN length(regexp_replace(c.phone, '[^0-9]', '', 'g')) IN (10,11)
        THEN '55' || regexp_replace(c.phone, '[^0-9]', '', 'g')
        ELSE regexp_replace(c.phone, '[^0-9]', '', 'g') END,
      'mensagem', '*KBOS — lembrete de pagamento*' || E'\nOlá ' || c.name ||
        '! A cobrança ' || t.descricao || ' de R$ ' || replace(t.valor::text, '.', ',') ||
        CASE WHEN (t.vencimento AT TIME ZONE 'America/Belem')::date = (now() AT TIME ZONE 'America/Belem')::date
          THEN ' vence hoje.' ELSE ' vence em 2 dias.' END,
      'evento', 'billing.reminder'),
      'billing-reminder-' || t.id::text || '-' || (t.vencimento AT TIME ZONE 'America/Belem')::date::text || '-' ||
        ((t.vencimento AT TIME ZONE 'America/Belem')::date - (now() AT TIME ZONE 'America/Belem')::date)::text
    FROM kbos_transactions t
    JOIN kbos_contacts c ON c.id = t.contact_id
    JOIN kbos_budget_sales s ON s.project_id = t.project_id AND s.accepted_at IS NOT NULL
    WHERE t.tipo = 'entrada' AND t.status IN ('pendente', 'vencido') AND length(regexp_replace(coalesce(c.phone,''), '[^0-9]', '', 'g')) BETWEEN 10 AND 15
      AND (t.vencimento AT TIME ZONE 'America/Belem')::date IN (
        (now() AT TIME ZONE 'America/Belem')::date,
        (now() AT TIME ZONE 'America/Belem')::date + 2)
    ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`);
  return { queued: result.rows.length };
}
