import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { budgets, contacts, transactions } from "@/lib/kbos/schema";
import { calcBudgetWithDiscount } from "@/lib/kbos/budget-calc";
import { DEFAULT_PIX_INFO } from "@/lib/kbos/constants";
import { buildInterestFreeOptions, inferServiceAndSubtype, saleAcceptanceSchema } from "@/lib/kbos/sale-plan";
import { acceptSale, buildAcceptanceVerification, readSale, type SaleSnapshot } from "@/lib/kbos/sales";
import { serverError } from "@/lib/kbos/http";
import { initialCompany } from "@/lib/kbos/planning";
import { withRateLimit } from "@/lib/kbos/rate-limit";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const sale = await readSale(token);
    const d = db();
    const [bRow] = await d
      .select({ budget: budgets, contact: contacts })
      .from(budgets)
      .leftJoin(contacts, eq(budgets.contactId, contacts.id))
      .where(eq(budgets.id, sale.budgetId))
      .limit(1);

    const b = bRow?.budget;
    const c = bRow?.contact;
    const s = sale.snapshot;
    const calc = calcBudgetWithDiscount(
      s.items || b?.items || [],
      s.discountType ?? b?.discountType,
      s.discountValue ?? b?.discountValue
    );
    const inferred = inferServiceAndSubtype({
      title: s.title || b?.title,
      terms: s.terms ?? b?.terms,
      items: s.items || b?.items,
      dates: s.eventDates || b?.eventDates,
    });

    const maxInstallments =
      sale.plan.service === "mensal" ? 1 : (s.maxInstallments ?? sale.plan.maxInstallments ?? 4);
    const useProgressiveDiscounts =
      sale.plan.service !== "mensal" && Boolean(s.progressiveDiscounts ?? sale.plan.progressiveDiscounts);
    const baseTotal = s.baseTotal ?? s.subtotal ?? calc.subtotal ?? s.total ?? calc.total;
    const interestFreeOptions =
      sale.plan.service === "mensal"
        ? []
        : s.interestFreeOptions && s.interestFreeOptions.length > 0
          ? s.interestFreeOptions
          : buildInterestFreeOptions(
              useProgressiveDiscounts ? baseTotal : (s.total ?? calc.total),
              sale.plan.startDate,
              sale.plan.deliveryDate,
              maxInstallments,
              useProgressiveDiscounts,
            );

    const snapshot: SaleSnapshot = {
      ...s,
      clientCompany: s.clientCompany ?? b?.clientCompany ?? c?.company ?? null,
      clientDocument: s.clientDocument ?? b?.clientDocument ?? c?.document ?? null,
      baseTotal,
      subtotal: s.subtotal ?? calc.subtotal,
      progressiveDiscounts: useProgressiveDiscounts,
      discountPercent: s.discountPercent ?? (s.discountType === "percent" ? Number(s.discountValue || 0) : 0),
      discountType: s.discountType ?? b?.discountType ?? "fixed",
      discountValue: s.discountValue ?? (b?.discountValue != null ? Number(b.discountValue) : 0),
      discountAmount: s.discountAmount ?? calc.discountAmount,
      paymentCondition: s.paymentCondition ?? b?.paymentCondition ?? "cash",
      applyCashDiscount: Boolean(s.applyCashDiscount ?? sale.plan.applyCashDiscount),
      installmentsCount: s.installmentsCount ?? (s.installments || []).length ?? 1,
      maxInstallments,
      interestFreeOptions,
      versionNumber: s.versionNumber ?? 1,
      deliveryDeadline: s.deliveryDeadline ?? b?.deliveryDeadline ?? null,
      revisionsCount: s.revisionsCount ?? b?.revisionsCount ?? 2,
      validUntil: s.validUntil ?? (b?.validUntil ? b.validUntil.toISOString().slice(0, 10) : null),
      createdAt: s.createdAt ?? (b?.createdAt ? b.createdAt.toISOString() : null),
      subtype: s.subtype ?? sale.plan.subtype ?? inferred.subtype,
      bankInfo: s.bankInfo?.trim() || b?.bankInfo?.trim() || DEFAULT_PIX_INFO,
    };

    let paidCount = 0;
    let totalCount = (snapshot.installments || []).length;
    if (sale.projectId) {
      const txRows = await d
        .select({ status: transactions.status, tipo: transactions.tipo, valor: transactions.valor })
        .from(transactions)
        .where(eq(transactions.projectId, sale.projectId));
      const incomeRows = txRows.filter((t) => t.tipo === "entrada");
      if (incomeRows.length > 0) totalCount = incomeRows.length;
      paidCount = incomeRows.filter((t) => t.status === "pago" && Number(t.valor) > 0).length;
    }

    const { service, subtype, startDate, deliveryDate, months, manualUrl, attachments, paymentCondition, applyCashDiscount, installmentsCount } = sale.plan;
    const companyProfile = await initialCompany(sale);
    const acceptance = buildAcceptanceVerification({ ...sale, snapshot });

    return NextResponse.json(
      {
        companyProfile,
        planningUrl: sale.acceptedAt && sale.companyProfile ? `/planejamento/${token}/` : null,
        snapshot,
        plan: {
          service,
          subtype: subtype ?? snapshot.subtype,
          startDate,
          deliveryDate,
          months,
          manualUrl,
          attachments,
          paymentCondition: paymentCondition ?? snapshot.paymentCondition,
          applyCashDiscount: Boolean(applyCashDiscount ?? snapshot.applyCashDiscount),
          progressiveDiscounts: useProgressiveDiscounts,
          installmentsCount: installmentsCount ?? snapshot.installmentsCount,
          maxInstallments,
        },
        acceptedAt: sale.acceptedAt,
        signerName: sale.signerName ?? null,
        acceptance,
        lifecycle: {
          proposalPresented: true,
          accepted: Boolean(sale.acceptedAt),
          contractFormalized: Boolean(sale.acceptedAt && sale.contractAccepted),
          paymentConfirmed: paidCount > 0,
          clientConverted: Boolean(sale.acceptedAt && paidCount > 0 && c?.status === "client"),
          paidInstallments: paidCount,
          totalInstallments: totalCount,
        },
        expiresAt: sale.expiresAt,
      },
      { headers }
    );
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await withRateLimit(req, "proposals:accept");
  if (limited) return limited;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = saleAcceptanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe seu nome e aceite o contrato e o Manual de Identidade." },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(
      await acceptSale(
        (await params).token,
        parsed.data.signerName,
        parsed.data.companyProfile,
        parsed.data.installmentsCount,
      ),
      { headers }
    );
  } catch (e) {
    return serverError(e);
  }
}
