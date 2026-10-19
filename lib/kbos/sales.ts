import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { budgets, budgetSales, contacts, deals } from "./schema";
import { PublicError } from "./http";
import { documentKind } from "./document";
import { canonicalAssets, canonicalProfile } from "./brand-assets";
import { companyProfileSchema, seedPlan } from "./planning-model";
import { buildContractClauses, isRecurringBudget, type Clause, type BudgetPdfData } from "./pdf-generator";
import { formatBRL } from "./budget-calc";
import { installmentsTotal, localDay, paymentSchedule, plannedTasks, salePlanSchema, type Installment } from "./sale-plan";

export type SaleSnapshot = {
  code: string; title: string; clientName: string; items: BudgetPdfData["items"];
  terms: string | null; clauses: Clause[]; installments: Installment[];
  total: number; bankInfo: string | null; eventDates: string[];
};
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const validSaleToken = (token: string) => /^[a-f0-9]{64}$/.test(token);

export async function issueSaleLink(id: string, input: unknown) {
  const parsed = salePlanSchema.safeParse(input);
  if (!parsed.success) throw new PublicError(parsed.error.issues[0]?.message || "Plano inválido.");
  const plan = parsed.data;
  if (plan.startDate < localDay()) throw new PublicError("Escolha uma data de início a partir de hoje.");
  const d = db();
  const [row] = await d.select({ budget: budgets, contact: contacts }).from(budgets)
    .leftJoin(contacts, eq(budgets.contactId, contacts.id)).where(eq(budgets.id, id)).limit(1);
  if (!row) throw new PublicError("Orçamento não encontrado.", 404);
  const b = row.budget;
  // Metadados vêm do banco, nunca do nome/hash enviados pelo navegador.
  for (const material of plan.attachments || []) {
    if (material.kind !== "file") continue;
    const found = await d.execute(sql`SELECT name, size, sha256 FROM kbos_budget_uploads WHERE id = ${material.fileId}::uuid AND budget_id = ${id}::uuid`);
    const file = found.rows[0];
    if (!file) throw new PublicError("Um dos arquivos não pertence a este orçamento. Envie-o novamente.");
    material.name = String(file.name); material.size = Number(file.size); material.sha256 = String(file.sha256);
  }
  if (!b.contactId || !row.contact) throw new PublicError("Vincule o orçamento a um contato do CRM antes de gerar o link.");
  if (!["draft", "sent"].includes(b.status)) throw new PublicError("Somente orçamentos em rascunho ou enviados podem gerar aceite.", 409);
  if (plan.dealId) {
    const [deal] = await d.select().from(deals).where(and(eq(deals.id, plan.dealId), eq(deals.contactId, b.contactId))).limit(1);
    if (!deal || ["won", "lost"].includes(deal.stage)) throw new PublicError("Escolha uma negociação aberta do mesmo contato.");
  }
  const recurring = isRecurringBudget(b);
  if (recurring !== (plan.service === "mensal")) throw new PublicError("O modelo mensal deve corresponder à vigência mensal descrita no orçamento.");
  const total = Number(b.totalAmount);
  let installments: Installment[];
  try { installments = paymentSchedule(total, b.paymentCondition, plan); }
  catch (e) { throw new PublicError(e instanceof Error ? e.message : "Condição inválida."); }
  const data: BudgetPdfData = { ...b, contactName: row.contact.name, contactCompany: row.contact.company, contactEmail: null, contactPhone: null };
  const clauses = buildContractClauses(data, total);
  // A condição escolhida e o cronograma publicados são parte do contrato.
  clauses[4] = { title: clauses[4].title, body: `Pagamento: ${installments.map((i) => `${i.label}: ${formatBRL(i.amount)}, ${i.onAcceptance ? "na assinatura" : `em ${i.dueDate.split("-").reverse().join("/")}`}`).join("; ")}. ${recurring ? "Plano mensal pré-pago, sem desconto à vista ou entrada e saldo. " : ""}Atraso superior a 7 dias suspende execução e entregas até a regularização.` };
  clauses[1] = { title: clauses[1].title, body: `Execução de ${plan.startDate} a ${plan.deliveryDate}.${recurring ? ` Vigência de ${plan.months} mês(es), com entregas mensais.` : " Até a entrega final aprovada."} O escopo limita-se aos itens desta proposta; demandas adicionais serão orçadas à parte.` };
  const eventDates = [...new Set([...(b.eventDates || []), ...b.items.map((i) => i.date).filter((v): v is string => !!v)])].sort();
  if (eventDates.some((date) => date < plan.startDate || date > plan.deliveryDate || !Number.isFinite(new Date(`${date}T12:00:00Z`).getTime()) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) {
    throw new PublicError("As datas dos itens devem ser válidas e estar dentro do período de execução.");
  }
  const snapshot: SaleSnapshot = { code: b.code, title: b.title, clientName: b.clientName || row.contact.name,
    items: b.items, terms: b.terms, clauses, installments, total, bankInfo: b.bankInfo, eventDates };
  const token = randomBytes(32).toString("hex");
  // Expira no início da execução (fim do dia local), nunca depois da validade.
  const expiresAt = new Date(Math.min(Date.now() + 7 * 86_400_000,
    new Date(`${plan.startDate}T23:59:59-03:00`).getTime(),
    b.validUntil ? new Date(`${b.validUntil.toISOString().slice(0, 10)}T23:59:59-03:00`).getTime() : Infinity));
  if (expiresAt.getTime() <= Date.now()) throw new PublicError("A validade do orçamento expirou.", 410);
  // Um único comando: bloqueia a versão do orçamento, avança o funil e publica.
  const result = await d.execute(sql`
    WITH source AS (
      UPDATE kbos_budgets b SET status = 'sent', updated_at = now()
      WHERE b.id = ${id}::uuid AND b.status IN ('draft','sent')
        AND date_trunc('milliseconds', b.updated_at) = ${b.updatedAt.toISOString()}::timestamptz
        AND NOT EXISTS (SELECT 1 FROM kbos_budget_sales s WHERE s.budget_id = b.id AND s.accepted_at IS NOT NULL)
      RETURNING b.*
    ), existing_deal AS (
      SELECT coalesce(${plan.dealId || null}::uuid, (SELECT (s.plan->>'dealId')::uuid FROM kbos_budget_sales s WHERE s.budget_id = ${id}::uuid)) AS id
    ), new_deal AS (
      INSERT INTO kbos_deals (title, contact_id, stage, value)
      SELECT title, contact_id, 'proposal', ${installmentsTotal(installments)} FROM source
      WHERE (SELECT id FROM existing_deal) IS NULL RETURNING id
    ), move_deal AS (
      UPDATE kbos_deals SET stage = 'proposal', value = ${installmentsTotal(installments)}, updated_at = now()
      WHERE id = (SELECT id FROM existing_deal) AND EXISTS (SELECT 1 FROM source) RETURNING id
    )
    INSERT INTO kbos_budget_sales (budget_id, token_hash, budget_version, snapshot, plan, expires_at)
    SELECT id, ${tokenHash(token)}, updated_at, ${JSON.stringify(snapshot)}::jsonb,
      ${JSON.stringify(plan)}::jsonb || jsonb_build_object('dealId', coalesce((SELECT id FROM existing_deal), (SELECT id FROM new_deal))), ${expiresAt.toISOString()}::timestamptz
    FROM source
    ON CONFLICT (budget_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, budget_version = EXCLUDED.budget_version,
      snapshot = EXCLUDED.snapshot, plan = EXCLUDED.plan, expires_at = EXCLUDED.expires_at
    WHERE kbos_budget_sales.accepted_at IS NULL
    RETURNING id`);
  if (!result.rows.length) throw new PublicError("O orçamento mudou ou já foi aceito. Atualize a página.", 409);
  return { token, expiresAt };
}

export async function readSale(token: string) {
  if (!validSaleToken(token)) throw new PublicError("Link não encontrado.", 404);
  const [row] = await db().select().from(budgetSales).where(eq(budgetSales.tokenHash, tokenHash(token))).limit(1);
  if (!row) throw new PublicError("Link não encontrado.", 404);
  if (!row.acceptedAt && row.expiresAt.getTime() < Date.now()) throw new PublicError("Este link expirou. Peça uma nova proposta.", 410);
  if (!row.acceptedAt) {
    const exact = await db().execute(sql`SELECT 1 FROM kbos_budgets b JOIN kbos_budget_sales s ON s.budget_id = b.id WHERE s.id = ${row.id}::uuid AND b.updated_at = s.budget_version AND b.status = 'sent'`);
    if (!exact.rows.length) throw new PublicError("Esta proposta foi atualizada ou cancelada. Peça um novo link.", 409);
  }
  return row;
}

export async function acceptSale(token: string, signerName: string, companyInput?: unknown) {
  const sale = await readSale(token);
  if (sale.acceptedAt) return { acceptedAt: sale.acceptedAt, alreadyAccepted: true, planningUrl: `/planejamento/${token}/` };
  const profile = await canonicalProfile(sale.budgetId, companyInput || companyProfileSchema.parse({ companyName: sale.snapshot.clientName, contactName: signerName }), true);
  const document = seedPlan(profile, sale.snapshot.title, sale.snapshot.items, sale.plan.startDate, sale.plan.deliveryDate);
  const plan = sale.plan;
  document.assets = [...profile.assets, ...await canonicalAssets(sale.budgetId, (plan.attachments || []).filter(a => a.kind === "file").map(a => ({ fileId: a.fileId!, name: a.name, category: a.role === "manual" ? "manual" as const : "reference" as const })))];
  const installments = sale.snapshot.installments.map((i) => ({ ...i, dueDate: i.onAcceptance ? localDay() : i.dueDate }));
  const tasks = plannedTasks(plan);
  const dates = [...new Set([...sale.snapshot.eventDates, plan.deliveryDate])];
  // O UPDATE condicional serializa cliques concorrentes. Todos os efeitos
  // dependem de claimed e são revertidos juntos se qualquer INSERT falhar.
  const result = await db().execute(sql`
    WITH budget_lock AS (
      SELECT b.* FROM kbos_budgets b WHERE b.id = ${sale.budgetId}::uuid FOR UPDATE
    ), claimed AS (
      UPDATE kbos_budget_sales s SET accepted_at = now(), signer_name = ${signerName},
        contract_accepted = true, manual_accepted = true, project_id = gen_random_uuid(), company_profile = ${JSON.stringify(profile)}::jsonb
      FROM budget_lock b WHERE s.id = ${sale.id}::uuid AND s.accepted_at IS NULL
        AND s.expires_at >= now() AND b.updated_at = s.budget_version AND b.status = 'sent'
      RETURNING s.*
    ), project AS (
      INSERT INTO kbos_projects (id, titulo, categoria, contact_id, budget_id, status, valor, prazo)
      SELECT claimed.project_id, b.title, ${plan.service}, b.contact_id, b.id, 'briefing',
        ${installmentsTotal(installments)}, ${plan.deliveryDate + "T12:00:00Z"}::timestamptz
      FROM budget_lock b, claimed RETURNING *
    ), planning AS (
      INSERT INTO kbos_client_plans (sale_id, project_id, signed_profile, draft)
      SELECT claimed.id, project.id, ${JSON.stringify(profile)}::jsonb, ${JSON.stringify(document)}::jsonb
      FROM claimed, project
    ), task_rows AS (
      INSERT INTO kbos_tasks (project_id, contact_id, titulo, due_at)
      SELECT p.id, p.contact_id, t.title, (t."dueDate" || 'T12:00:00Z')::timestamptz
      FROM project p CROSS JOIN jsonb_to_recordset(${JSON.stringify(tasks)}::jsonb) AS t(title text, "dueDate" text)
    ), bills AS (
      INSERT INTO kbos_transactions (tipo, descricao, valor, vencimento, project_id, contact_id, scope, categoria)
      SELECT 'entrada', ${sale.snapshot.code + " · "} || i.label, i.amount,
        (i."dueDate" || 'T12:00:00Z')::timestamptz, p.id, p.contact_id, 'empresa', 'Venda conectada'
      FROM project p CROSS JOIN jsonb_to_recordset(${JSON.stringify(installments)}::jsonb) AS i(label text, amount numeric, "dueDate" text)
    ), agenda AS (
      INSERT INTO kbos_events (title, description, start_time)
      SELECT p.titulo || ' · ' || CASE WHEN day = ${plan.deliveryDate} THEN 'Entrega' ELSE 'Execução' END,
        ${"Orçamento " + sale.snapshot.code}, (day || 'T12:00:00Z')::timestamptz
      FROM project p CROSS JOIN jsonb_array_elements_text(${JSON.stringify(dates)}::jsonb) AS day
    ), win AS (
      UPDATE kbos_deals SET stage = 'won', updated_at = now()
      WHERE id = ${plan.dealId || null}::uuid AND EXISTS (SELECT 1 FROM claimed)
    ), client AS (
      UPDATE kbos_contacts SET status = 'client', updated_at = now(),
        name = coalesce(nullif(${profile.contactName}, ''), name), company = coalesce(nullif(${profile.companyName}, ''), company),
        kind = coalesce(${documentKind(profile.document)}, kind),
        legal_name = coalesce(nullif(${profile.legalName}, ''), legal_name), document = coalesce(nullif(${profile.document}, ''), document),
        email = coalesce(nullif(${profile.email}, ''), email), phone = coalesce(nullif(${profile.phone}, ''), phone),
        website = coalesce(nullif(${profile.website}, ''), website), instagram = coalesce(nullif(${profile.instagram}, ''), instagram),
        address = coalesce(nullif(${profile.address}, ''), address),
        city = coalesce(nullif(${profile.city}, ''), city), state = coalesce(nullif(${profile.state}, ''), state),
        zip_code = coalesce(nullif(${profile.zip}, ''), zip_code)
      WHERE id IN (SELECT contact_id FROM project)
    ), approve AS (
      UPDATE kbos_budgets SET status = 'approved', updated_at = now()
      WHERE id = ${sale.budgetId}::uuid AND EXISTS (SELECT 1 FROM claimed)
    )
    SELECT accepted_at FROM claimed`);
  if (!result.rows.length) {
    const current = await readSale(token);
    if (current.acceptedAt) return { acceptedAt: current.acceptedAt, alreadyAccepted: true, planningUrl: `/planejamento/${token}/` };
    throw new PublicError("A proposta mudou. Peça um novo link ao estúdio.", 409);
  }
  return { acceptedAt: result.rows[0].accepted_at, alreadyAccepted: false, planningUrl: `/planejamento/${token}/` };
}

/**
 * Desfaz um aceite feito por engano/teste: remove projeto, tarefas, cobranças
 * pendentes, agenda e modelo de planejamento criados no aceite, apaga o link
 * e devolve o orçamento a "enviado" (e o negócio a "proposta").
 * Recusa se alguma cobrança já foi paga: dinheiro real não se apaga.
 * `confirm` precisa ser o código do orçamento (ex.: "#14002"), como confirmação.
 */
export async function undoAcceptedSale(budgetId: string, confirm: string) {
  const d = db();
  const [row] = (await d.execute(sql`
    SELECT s.id AS sale_id, s.project_id, s.plan, b.code
    FROM kbos_budget_sales s JOIN kbos_budgets b ON b.id = s.budget_id
    WHERE s.budget_id = ${budgetId}::uuid AND s.accepted_at IS NOT NULL`)).rows as { sale_id: string; project_id: string | null; plan: { dealId?: string | null }; code: string }[];
  if (!row) throw new PublicError("Este orçamento não tem aceite para desfazer.", 404);
  if (confirm !== row.code) throw new PublicError(`Confirmação inválida: envie o código do orçamento (${row.code}).`, 400);
  if (row.project_id) {
    const paid = await d.execute(sql`SELECT 1 FROM kbos_transactions WHERE project_id = ${row.project_id}::uuid AND status = 'pago' LIMIT 1`);
    if (paid.rows.length) throw new PublicError("Há cobrança já paga neste projeto. Não dá para desfazer o aceite.", 409);
    await d.execute(sql`DELETE FROM kbos_transactions WHERE project_id = ${row.project_id}::uuid`);
    await d.execute(sql`DELETE FROM kbos_events e USING kbos_projects p WHERE p.id = ${row.project_id}::uuid AND e.description = ${"Orçamento " + row.code} AND e.title LIKE p.titulo || ' · %'`);
  }
  await d.execute(sql`DELETE FROM kbos_client_plans WHERE sale_id = ${row.sale_id}::uuid`);
  await d.execute(sql`UPDATE kbos_budget_sales SET project_id = NULL WHERE id = ${row.sale_id}::uuid`);
  if (row.project_id) await d.execute(sql`DELETE FROM kbos_projects WHERE id = ${row.project_id}::uuid`);
  await d.execute(sql`DELETE FROM kbos_budget_sales WHERE id = ${row.sale_id}::uuid`);
  if (row.plan?.dealId) await d.execute(sql`UPDATE kbos_deals SET stage = 'proposal', updated_at = now() WHERE id = ${row.plan.dealId}::uuid AND stage = 'won'`);
  await d.execute(sql`UPDATE kbos_budgets SET status = 'sent', updated_at = now() WHERE id = ${budgetId}::uuid`);
  return { ok: true, code: row.code };
}
