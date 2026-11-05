import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { budgets, budgetSales, contacts, deals } from "./schema";
import { PublicError } from "./http";
import { documentKind } from "./document";
import { canonicalAssets, canonicalProfile } from "./brand-assets";
import { companyProfileSchema, seedPlan } from "./planning-model";
import { buildContractClauses, isRecurringBudget, type Clause, type BudgetPdfData } from "./pdf-generator";
import { calcBudgetWithDiscount, formatBRL, type DiscountType } from "./budget-calc";
import { DEFAULT_PIX_INFO } from "./constants";
import { buildInterestFreeOptions, inferServiceAndSubtype, installmentsTotal, localDay, paymentSchedule, plannedTasks, PROGRESSIVE_DISCOUNT_RATES, salePlanSchema, type Installment, type InterestFreeOption } from "./sale-plan";

export type SaleSnapshot = {
  code: string;
  title: string;
  clientName: string;
  clientCompany?: string | null;
  clientDocument?: string | null;
  items: BudgetPdfData["items"];
  terms: string | null;
  clauses: Clause[];
  installments: Installment[];
  installmentsCount?: number;
  maxInstallments?: number;
  interestFreeOptions?: InterestFreeOption[];
  progressiveDiscounts?: boolean;
  baseTotal?: number;
  discountPercent?: number;
  versionNumber?: number;
  total: number;
  subtotal?: number;
  discountType?: string | null;
  discountValue?: number | null;
  discountAmount?: number;
  paymentCondition?: string | null;
  applyCashDiscount?: boolean;
  deliveryDeadline?: string | null;
  revisionsCount?: number | null;
  validUntil?: string | null;
  createdAt?: string | null;
  subtype?: string | null;
  bankInfo: string | null;
  eventDates: string[];
};

export function buildPaymentClauseBody(
  installments: Installment[],
  opts: {
    recurring: boolean;
    maxInstallments: number;
    progressiveDiscounts?: boolean;
    baseTotal?: number;
    discountPercent?: number;
    discountAmount?: number;
    finalTotal?: number;
  },
): string {
  const scheduleText = installments
    .map((i) => `${i.label}: ${formatBRL(i.amount)}, ${i.onAcceptance ? "na assinatura" : `em ${i.dueDate.split("-").reverse().join("/")}`}`)
    .join("; ");

  if (opts.progressiveDiscounts && !opts.recurring) {
    const base = opts.baseTotal ?? opts.finalTotal ?? installmentsTotal(installments);
    const pct = opts.discountPercent ?? (PROGRESSIVE_DISCOUNT_RATES[installments.length] ?? 0);
    const disc = opts.discountAmount ?? Math.round((base * (pct / 100) + Number.EPSILON) * 100) / 100;
    const finalVal = opts.finalTotal ?? installmentsTotal(installments);
    const conditionSummary =
      pct > 0
        ? `Pagamento via PIX direto (${installments.length}x sem juros · ${pct}% de desconto progressivo sobre ${formatBRL(base)}, economia de ${formatBRL(disc)}, valor final de ${formatBRL(finalVal)})`
        : `Pagamento via PIX direto (${installments.length}x sem juros · valor base de ${formatBRL(base)}, sem desconto)`;
    return `${conditionSummary}: ${scheduleText}. Tabela de descontos progressivos via PIX: à vista (1x) com 10% de desconto, 2x com 6% de desconto, 3x com 3% de desconto ou 4x sem desconto. Confirmação manual pelo estúdio; atraso superior a 7 dias suspende execução e entregas até a regularização.`;
  }

  return `Pagamento (${installments.length}x sem juros): ${scheduleText}.${!opts.recurring && opts.maxInstallments > 1 ? ` Opções disponíveis sem juros e sem desconto automático: 1x a ${opts.maxInstallments}x.` : ""} ${opts.recurring ? "Plano mensal pré-pago, sem desconto à vista ou entrada e saldo. " : ""}Atraso superior a 7 dias suspende execução e entregas até a regularização.`;
}

export type AcceptanceVerification = {
  code: string;
  verificationCode: string;
  sha256: string;
  acceptedAt: string;
  budgetVersion: string;
  signerName: string;
  proposalCode: string;
  proposalTitle: string;
  total: number;
  installments: Installment[];
};

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const validSaleToken = (token: string) => /^[a-f0-9]{64}$/.test(token);

export function buildAcceptanceVerification(sale: {
  id: string;
  budgetId: string;
  budgetVersion: Date | string;
  acceptedAt: Date | string | null;
  signerName: string | null;
  snapshot: SaleSnapshot;
}): AcceptanceVerification | null {
  if (!sale.acceptedAt || !sale.signerName) return null;
  const acceptedIso =
    sale.acceptedAt instanceof Date ? sale.acceptedAt.toISOString() : new Date(sale.acceptedAt).toISOString();
  const versionIso =
    sale.budgetVersion instanceof Date ? sale.budgetVersion.toISOString() : new Date(sale.budgetVersion).toISOString();
  const payload = `${sale.id}|${sale.budgetId}|${sale.snapshot.code}|${versionIso}|${acceptedIso}|${sale.signerName}|${sale.snapshot.total}`;
  const sha256 = createHash("sha256").update(payload).digest("hex");
  const cleanCode = (sale.snapshot.code || "").replace(/[^A-Z0-9]/gi, "") || "PROP";
  const verificationCode = `KBOS-${cleanCode}-${sha256.slice(0, 10).toUpperCase()}`;
  return {
    code: verificationCode,
    verificationCode,
    sha256,
    acceptedAt: acceptedIso,
    budgetVersion: versionIso,
    signerName: sale.signerName,
    proposalCode: sale.snapshot.code,
    proposalTitle: sale.snapshot.title,
    total: sale.snapshot.total,
    installments: sale.snapshot.installments || [],
  };
}

export async function getSaleLinkStatus(budgetId: string) {
  const [existing] = await db()
    .select()
    .from(budgetSales)
    .where(eq(budgetSales.budgetId, budgetId))
    .limit(1);
  if (!existing) {
    return {
      exists: false,
      accepted: false,
      acceptedAt: null,
      expiresAt: null,
      versionNumber: 0,
      installmentsCount: null,
      maxInstallments: 4,
      subtype: null,
      total: null,
    };
  }
  return {
    exists: true,
    accepted: Boolean(existing.acceptedAt),
    acceptedAt: existing.acceptedAt,
    expiresAt: existing.expiresAt,
    versionNumber: existing.snapshot?.versionNumber ?? 1,
    installmentsCount: existing.snapshot?.installmentsCount ?? existing.snapshot?.installments?.length ?? 1,
    maxInstallments: existing.snapshot?.maxInstallments ?? existing.plan?.maxInstallments ?? 4,
    subtype: existing.snapshot?.subtype ?? existing.plan?.subtype ?? null,
    total: existing.snapshot?.total ?? null,
  };
}

export async function issueSaleLink(
  id: string,
  input: unknown,
  options?: { requireReplaceConfirmation?: boolean },
) {
  const parsed = salePlanSchema.safeParse(input);
  if (!parsed.success) throw new PublicError(parsed.error.issues[0]?.message || "Plano inválido.");
  const plan = parsed.data;
  if (plan.startDate < localDay()) throw new PublicError("Escolha uma data de início a partir de hoje.");
  const d = db();
  const [row] = await d.select({ budget: budgets, contact: contacts }).from(budgets)
    .leftJoin(contacts, eq(budgets.contactId, contacts.id)).where(eq(budgets.id, id)).limit(1);
  if (!row) throw new PublicError("Orçamento não encontrado.", 404);
  const b = row.budget;

  const [existingSale] = await d
    .select()
    .from(budgetSales)
    .where(eq(budgetSales.budgetId, id))
    .limit(1);

  if (existingSale?.acceptedAt) {
    throw new PublicError("Esta proposta já foi aceita e não pode ser modificada.", 409);
  }
  if (existingSale && options?.requireReplaceConfirmation && plan.replaceExisting !== true) {
    throw new PublicError(
      "Já existe um link e snapshot emitidos para esta proposta. Autorize explicitamente a criação de uma nova versão para substituir o link anterior.",
      409,
    );
  }
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

  // Aplica overrides opcionais configurados na tela de emissão do link (SaleLink),
  // persistindo-os no orçamento e refletindo-os no snapshot público.
  const useProgressiveDiscounts = !recurring && Boolean(plan.progressiveDiscounts);
  const effectivePaymentCondition = plan.paymentCondition ?? b.paymentCondition;
  const effectiveDiscountType: DiscountType = useProgressiveDiscounts
    ? "percent"
    : plan.discountType ?? (b.discountType === "percent" ? "percent" : "fixed");
  const hasExplicitDiscountChange =
    plan.discountType !== undefined || plan.discountValue !== undefined;
  const rawDiscountValue = useProgressiveDiscounts
    ? 0
    : plan.discountValue !== undefined
      ? plan.discountValue
      : b.discountValue != null
        ? Number(b.discountValue)
        : 0;
  const effectiveDeliveryDeadline =
    plan.deliveryDeadline !== undefined
      ? plan.deliveryDeadline?.trim() || null
      : b.deliveryDeadline;

  const calc = calcBudgetWithDiscount(b.items, effectiveDiscountType, rawDiscountValue);
  const baseTotal = calc.subtotal > 0 ? calc.subtotal : Number(b.totalAmount);

  const inferred = inferServiceAndSubtype({
    title: b.title,
    terms: b.terms,
    items: b.items,
    dates: b.eventDates,
  });
  const effectiveSubtype = plan.subtype?.trim() || inferred.subtype;
  const maxInstallments = recurring ? 1 : (plan.maxInstallments ?? 4);
  const versionNumber = (existingSale?.snapshot?.versionNumber ?? 0) + 1;
  const planWithMeta = {
    ...plan,
    subtype: effectiveSubtype,
    maxInstallments,
    paymentCondition: (effectivePaymentCondition as "cash" | "installments" | "card" | undefined) ?? undefined,
    applyCashDiscount: useProgressiveDiscounts ? false : Boolean(plan.applyCashDiscount),
    progressiveDiscounts: useProgressiveDiscounts,
  };

  const preScheduleTotal = useProgressiveDiscounts
    ? baseTotal
    : hasExplicitDiscountChange
      ? calc.total
      : Number(b.totalAmount);

  let installments: Installment[];
  try { installments = paymentSchedule(preScheduleTotal, effectivePaymentCondition, planWithMeta); }
  catch (e) { throw new PublicError(e instanceof Error ? e.message : "Condição inválida."); }

  const interestFreeOptions = recurring
    ? []
    : buildInterestFreeOptions(
        useProgressiveDiscounts ? baseTotal : preScheduleTotal,
        plan.startDate,
        plan.deliveryDate,
        maxInstallments,
        useProgressiveDiscounts,
      );

  const activeProgressiveOpt = useProgressiveDiscounts
    ? interestFreeOptions.find((o) => o.count === installments.length) ?? interestFreeOptions[0]
    : null;

  const subtotal = useProgressiveDiscounts ? baseTotal : calc.subtotal;
  const discountPercent = activeProgressiveOpt
    ? activeProgressiveOpt.discountPercent
    : effectiveDiscountType === "percent"
      ? rawDiscountValue
      : 0;
  const effectiveDiscountValue = activeProgressiveOpt
    ? activeProgressiveOpt.discountPercent
    : rawDiscountValue;
  const discountAmount = activeProgressiveOpt
    ? activeProgressiveOpt.discountAmount
    : calc.discountAmount;
  const total = activeProgressiveOpt
    ? activeProgressiveOpt.total
    : preScheduleTotal;
  const budgetPersistedTotal = useProgressiveDiscounts ? baseTotal : total;
  const budgetPersistedDiscountValue = useProgressiveDiscounts
    ? null
    : effectiveDiscountValue > 0
      ? String(effectiveDiscountValue)
      : b.discountValue;

  const data: BudgetPdfData = {
    ...b,
    totalAmount: String(total),
    baseTotal: useProgressiveDiscounts ? baseTotal : subtotal,
    discountType: effectiveDiscountType,
    discountValue: effectiveDiscountValue,
    paymentCondition: effectivePaymentCondition,
    deliveryDeadline: effectiveDeliveryDeadline,
    subtype: effectiveSubtype,
    applyCashDiscount: planWithMeta.applyCashDiscount,
    progressiveDiscounts: useProgressiveDiscounts,
    progressiveOptions: useProgressiveDiscounts ? interestFreeOptions : null,
    installmentsCount: installments.length,
    maxInstallments,
    customInstallments: installments,
    contactName: row.contact.name,
    contactCompany: row.contact.company,
    contactEmail: null,
    contactPhone: null,
  };
  const clauses = buildContractClauses(data, total);
  // A condição escolhida e o cronograma publicados são parte do contrato.
  clauses[4] = {
    title: clauses[4].title,
    body: buildPaymentClauseBody(installments, {
      recurring,
      maxInstallments,
      progressiveDiscounts: useProgressiveDiscounts,
      baseTotal,
      discountPercent,
      discountAmount,
      finalTotal: total,
    }),
  };
  clauses[1] = { title: clauses[1].title, body: `Execução de ${plan.startDate} a ${plan.deliveryDate}.${recurring ? ` Vigência de ${plan.months} mês(es), com entregas mensais.` : " Até a entrega final aprovada."} O escopo limita-se aos itens desta proposta; demandas adicionais serão orçadas à parte.` };
  const eventDates = [...new Set([...(b.eventDates || []), ...b.items.map((i) => i.date).filter((v): v is string => !!v)])].sort();
  if (eventDates.some((date) => date < plan.startDate || date > plan.deliveryDate || !Number.isFinite(new Date(`${date}T12:00:00Z`).getTime()) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) {
    throw new PublicError("As datas dos itens devem ser válidas e estar dentro do período de execução.");
  }
  const snapshot: SaleSnapshot = {
    code: b.code,
    title: b.title,
    clientName: b.clientName || row.contact.name,
    clientCompany: b.clientCompany || row.contact.company || null,
    clientDocument: b.clientDocument || row.contact.document || null,
    items: b.items,
    terms: b.terms,
    clauses,
    installments,
    installmentsCount: installments.length,
    maxInstallments,
    interestFreeOptions,
    progressiveDiscounts: useProgressiveDiscounts,
    baseTotal: useProgressiveDiscounts ? baseTotal : subtotal,
    discountPercent,
    versionNumber,
    total,
    subtotal,
    discountType: effectiveDiscountType,
    discountValue: effectiveDiscountValue,
    discountAmount,
    paymentCondition: effectivePaymentCondition,
    applyCashDiscount: planWithMeta.applyCashDiscount,
    deliveryDeadline: effectiveDeliveryDeadline,
    revisionsCount: b.revisionsCount ?? 2,
    validUntil: b.validUntil ? b.validUntil.toISOString().slice(0, 10) : null,
    createdAt: b.createdAt ? b.createdAt.toISOString() : new Date().toISOString(),
    subtype: effectiveSubtype,
    bankInfo: b.bankInfo?.trim() || DEFAULT_PIX_INFO,
    eventDates,
  };
  const token = randomBytes(32).toString("hex");
  // Expira no início da execução (fim do dia local), nunca depois da validade.
  const expiresAt = new Date(Math.min(Date.now() + 7 * 86_400_000,
    new Date(`${plan.startDate}T23:59:59-03:00`).getTime(),
    b.validUntil ? new Date(`${b.validUntil.toISOString().slice(0, 10)}T23:59:59-03:00`).getTime() : Infinity));
  if (expiresAt.getTime() <= Date.now()) throw new PublicError("A validade do orçamento expirou.", 410);
  // Um único comando: persiste ajustes comerciais no orçamento, bloqueia a versão, avança o funil e publica.
  const result = await d.execute(sql`
    WITH source AS (
      UPDATE kbos_budgets b
      SET status = 'sent',
          payment_condition = ${effectivePaymentCondition ?? null},
          discount_type = ${effectiveDiscountType},
          discount_value = ${budgetPersistedDiscountValue},
          total_amount = ${String(budgetPersistedTotal)},
          delivery_deadline = ${effectiveDeliveryDeadline},
          updated_at = now()
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
      ${JSON.stringify(planWithMeta)}::jsonb || jsonb_build_object('dealId', coalesce((SELECT id FROM existing_deal), (SELECT id FROM new_deal))), ${expiresAt.toISOString()}::timestamptz
    FROM source
    ON CONFLICT (budget_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, budget_version = EXCLUDED.budget_version,
      snapshot = EXCLUDED.snapshot, plan = EXCLUDED.plan, expires_at = EXCLUDED.expires_at
    WHERE kbos_budget_sales.accepted_at IS NULL
    RETURNING id`);
  if (!result.rows.length) throw new PublicError("O orçamento mudou ou já foi aceito. Atualize a página.", 409);
  return { token, expiresAt, versionNumber, replacedExisting: Boolean(existingSale) };
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

export async function acceptSale(
  token: string,
  signerName: string,
  companyInput?: unknown,
  selectedInstallmentsCount?: number,
) {
  const sale = await readSale(token);
  if (sale.acceptedAt) {
    return {
      acceptedAt: sale.acceptedAt,
      alreadyAccepted: true,
      planningUrl: `/planejamento/${token}/`,
      signerName: sale.signerName,
      acceptance: buildAcceptanceVerification(sale),
    };
  }
  const profile = await canonicalProfile(sale.budgetId, companyInput || companyProfileSchema.parse({ companyName: sale.snapshot.clientName, contactName: signerName }), true);
  const document = seedPlan(profile, sale.snapshot.title, sale.snapshot.items, sale.plan.startDate, sale.plan.deliveryDate);
  const plan = sale.plan;
  document.assets = [...profile.assets, ...await canonicalAssets(sale.budgetId, (plan.attachments || []).filter(a => a.kind === "file").map(a => ({ fileId: a.fileId!, name: a.name, category: a.role === "manual" ? "manual" as const : "reference" as const })))];

  const maxAllowed = plan.service === "mensal" ? 1 : (sale.snapshot.maxInstallments ?? plan.maxInstallments ?? 4);
  const isProgressive = plan.service !== "mensal" && Boolean(sale.snapshot.progressiveDiscounts || plan.progressiveDiscounts);
  let baseInstallments = sale.snapshot.installments;
  let updatedSnapshot = sale.snapshot;
  let updatedPlan = plan;

  const targetCount =
    selectedInstallmentsCount != null &&
    Number.isInteger(selectedInstallmentsCount) &&
    selectedInstallmentsCount >= 1 &&
    selectedInstallmentsCount <= maxAllowed
      ? selectedInstallmentsCount
      : isProgressive
        ? Math.min(maxAllowed, Math.max(1, sale.snapshot.installmentsCount ?? sale.snapshot.installments?.length ?? 1))
        : null;

  if (plan.service !== "mensal" && targetCount != null) {
    const cond =
      targetCount > 1
        ? "installments"
        : (sale.snapshot.paymentCondition as "cash" | "installments" | "card" | undefined) || "cash";
    updatedPlan = {
      ...plan,
      paymentCondition: cond,
      installmentsCount: targetCount,
      applyCashDiscount: isProgressive ? false : targetCount === 1 ? Boolean(sale.snapshot.applyCashDiscount) : false,
      progressiveDiscounts: isProgressive,
    };

    if (isProgressive) {
      const baseTotal =
        sale.snapshot.baseTotal ??
        sale.snapshot.subtotal ??
        calcBudgetWithDiscount(sale.snapshot.items || [], "fixed", 0).subtotal ??
        sale.snapshot.total;
      const progressiveOpts = buildInterestFreeOptions(baseTotal, plan.startDate, plan.deliveryDate, maxAllowed, true);
      const chosenOpt = progressiveOpts.find((o) => o.count === targetCount) ?? progressiveOpts[0];
      baseInstallments = chosenOpt.installments;
      const updatedClauses = [...(sale.snapshot.clauses || [])];
      if (updatedClauses[4]) {
        updatedClauses[4] = {
          title: updatedClauses[4].title,
          body: buildPaymentClauseBody(baseInstallments, {
            recurring: false,
            maxInstallments: maxAllowed,
            progressiveDiscounts: true,
            baseTotal,
            discountPercent: chosenOpt.discountPercent,
            discountAmount: chosenOpt.discountAmount,
            finalTotal: chosenOpt.total,
          }),
        };
      }
      updatedSnapshot = {
        ...sale.snapshot,
        baseTotal,
        subtotal: baseTotal,
        total: chosenOpt.total,
        discountType: "percent",
        discountValue: chosenOpt.discountPercent,
        discountPercent: chosenOpt.discountPercent,
        discountAmount: chosenOpt.discountAmount,
        progressiveDiscounts: true,
        interestFreeOptions: progressiveOpts,
        installments: baseInstallments,
        installmentsCount: baseInstallments.length,
        paymentCondition: cond,
        clauses: updatedClauses,
      };
    } else {
      baseInstallments = paymentSchedule(sale.snapshot.total, cond, updatedPlan);
      const updatedClauses = [...(sale.snapshot.clauses || [])];
      if (updatedClauses[4]) {
        updatedClauses[4] = {
          title: updatedClauses[4].title,
          body: buildPaymentClauseBody(baseInstallments, {
            recurring: false,
            maxInstallments: maxAllowed,
            progressiveDiscounts: false,
          }),
        };
      }
      updatedSnapshot = {
        ...sale.snapshot,
        installments: baseInstallments,
        installmentsCount: baseInstallments.length,
        paymentCondition: cond,
        clauses: updatedClauses,
      };
    }
  }

  const installments = baseInstallments.map((i) => ({ ...i, dueDate: i.onAcceptance ? localDay() : i.dueDate }));
  const tasks = plannedTasks(plan);
  const dates = [...new Set([...sale.snapshot.eventDates, plan.deliveryDate])];
  // O UPDATE condicional serializa cliques concorrentes. Todos os efeitos
  // dependem de claimed e são revertidos juntos se qualquer INSERT falhar.
  // Regra global KBOS (#6): o aceite isolado NÃO converte o lead em cliente;
  // a conversão ocorre quando há aceite explícito + primeiro pagamento confirmado de valor positivo.
  const result = await db().execute(sql`
    WITH budget_lock AS (
      SELECT b.* FROM kbos_budgets b WHERE b.id = ${sale.budgetId}::uuid FOR UPDATE
    ), claimed AS (
      UPDATE kbos_budget_sales s SET accepted_at = now(), signer_name = ${signerName},
        contract_accepted = true, manual_accepted = true, project_id = gen_random_uuid(),
        company_profile = ${JSON.stringify(profile)}::jsonb,
        snapshot = ${JSON.stringify(updatedSnapshot)}::jsonb,
        plan = ${JSON.stringify(updatedPlan)}::jsonb
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
      UPDATE kbos_deals SET stage = 'won', value = ${installmentsTotal(installments)}, updated_at = now()
      WHERE id = ${plan.dealId || null}::uuid AND EXISTS (SELECT 1 FROM claimed)
    ), contact_profile AS (
      UPDATE kbos_contacts SET updated_at = now(),
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
      UPDATE kbos_budgets
      SET status = 'approved',
          total_amount = ${String(updatedSnapshot.total)},
          payment_condition = ${updatedSnapshot.paymentCondition ?? null},
          discount_type = ${updatedSnapshot.discountType ?? "fixed"},
          discount_value = ${updatedSnapshot.discountValue != null && updatedSnapshot.discountValue > 0 ? String(updatedSnapshot.discountValue) : null},
          updated_at = now()
      WHERE id = ${sale.budgetId}::uuid AND EXISTS (SELECT 1 FROM claimed)
    )
    SELECT accepted_at, signer_name FROM claimed`);
  if (!result.rows.length) {
    const current = await readSale(token);
    if (current.acceptedAt) {
      return {
        acceptedAt: current.acceptedAt,
        alreadyAccepted: true,
        planningUrl: `/planejamento/${token}/`,
        signerName: current.signerName,
        acceptance: buildAcceptanceVerification(current),
      };
    }
    throw new PublicError("A proposta mudou. Peça um novo link ao estúdio.", 409);
  }
  const acceptedAt = result.rows[0].accepted_at as Date | string;
  return {
    acceptedAt,
    alreadyAccepted: false,
    planningUrl: `/planejamento/${token}/`,
    signerName,
    acceptance: buildAcceptanceVerification({
      ...sale,
      snapshot: updatedSnapshot,
      acceptedAt,
      signerName,
    }),
  };
}

/**
 * Regra global do KBOS:
 * Aceite explícito da proposta (kbos_budget_sales.accepted_at IS NOT NULL e contract_accepted = true)
 * + Primeiro pagamento real confirmado de qualquer valor positivo (kbos_transactions.status = 'pago', tipo = 'entrada', valor > 0)
 * = Conversão automática do lead em cliente (kbos_contacts.status = 'client').
 *
 * Pagamento isolado sem proposta aceita ou de valor <= 0 não converte o lead.
 */
export async function syncLeadConversionForTransaction(transactionId: string): Promise<{ converted: boolean; contactId: string | null }> {
  const res = await db().execute(sql`
    UPDATE kbos_contacts c
    SET status = 'client', updated_at = now()
    FROM kbos_transactions t
    JOIN kbos_budget_sales s ON s.project_id = t.project_id
    WHERE t.id = ${transactionId}::uuid
      AND t.tipo = 'entrada'
      AND t.status = 'pago'
      AND t.valor > 0
      AND s.accepted_at IS NOT NULL
      AND s.contract_accepted = true
      AND c.id = coalesce(t.contact_id, (SELECT p.contact_id FROM kbos_projects p WHERE p.id = t.project_id))
      AND c.status = 'lead'
    RETURNING c.id`);
  const row = res.rows[0] as { id?: string } | undefined;
  return { converted: res.rows.length > 0, contactId: row?.id ? String(row.id) : null };
}

/**
 * Confirma o pagamento de uma cobrança e aplica a regra de conversão automática
 * (aceite explícito + pagamento confirmado -> cliente).
 */
export async function confirmSalePayment(transactionId: string, gatewayRef?: string | null) {
  const d = db();
  await d.execute(sql`
    UPDATE kbos_transactions
    SET status = 'pago',
        gateway_ref = coalesce(${gatewayRef ?? null}, gateway_ref)
    WHERE id = ${transactionId}::uuid`);
  const { converted, contactId } = await syncLeadConversionForTransaction(transactionId);
  return { ok: true, paymentConfirmed: true, converted, clientConverted: converted, contactId };
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
