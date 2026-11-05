import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { budgets, contacts } from "@/lib/kbos/schema";
import { buildAcceptanceVerification, buildPaymentClauseBody, readSale } from "@/lib/kbos/sales";
import { initialCompany } from "@/lib/kbos/planning";
import { buildInterestFreeOptions, inferServiceAndSubtype } from "@/lib/kbos/sale-plan";
import { renderBudgetPdf, type BudgetPdfData } from "@/lib/kbos/pdf-generator";
import { serverError } from "@/lib/kbos/http";

export const dynamic = "force-dynamic";

// GET /api/proposals/[token]/pdf — gera e entrega o PDF atualizado (2 páginas:
// Resumo Comercial + Instrumento Particular de Prestação de Serviços) antes e
// depois do aceite, com dados reais e registro verificável do aceite quando assinado.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const url = new URL(req.url);
    const inline = url.searchParams.get("inline") === "1";
    const docKind = url.searchParams.get("doc"); // "proposta" | "contrato" | "aceito"

    const sale = await readSale(token);
    if (docKind === "contrato" && !sale.acceptedAt) {
      return NextResponse.json(
        { error: "O contrato formalizado em PDF fica disponível após o aceite da proposta." },
        { status: 409 }
      );
    }

    const [row] = await db()
      .select({ budget: budgets, contact: contacts })
      .from(budgets)
      .leftJoin(contacts, eq(budgets.contactId, contacts.id))
      .where(eq(budgets.id, sale.budgetId))
      .limit(1);

    const b = row?.budget;
    const c = row?.contact;
    const s = sale.snapshot;
    const profile = await initialCompany(sale);
    const acceptance = buildAcceptanceVerification(sale);
    const inferred = inferServiceAndSubtype({
      title: s.title || b?.title,
      terms: s.terms ?? b?.terms,
      items: s.items || b?.items,
      dates: s.eventDates || b?.eventDates,
    });

    const addressParts = [
      profile.address || c?.address,
      [profile.city || c?.city, profile.state || c?.state].filter(Boolean).join("/"),
      (profile.zip || c?.zipCode) && `CEP ${profile.zip || c?.zipCode}`,
    ]
      .filter(Boolean)
      .join(" · ");

    const maxInstallments =
      sale.plan.service === "mensal" ? 1 : (s.maxInstallments ?? sale.plan.maxInstallments ?? 4);
    const useProgressiveDiscounts =
      sale.plan.service !== "mensal" && Boolean(s.progressiveDiscounts ?? sale.plan.progressiveDiscounts);
    const baseTotal = s.baseTotal ?? s.subtotal ?? s.total;
    const progressiveOptions = useProgressiveDiscounts
      ? s.interestFreeOptions && s.interestFreeOptions.length > 0
        ? s.interestFreeOptions
        : buildInterestFreeOptions(baseTotal, sale.plan.startDate, sale.plan.deliveryDate, maxInstallments, true)
      : null;

    const requestedInstallmentsParam = Number(url.searchParams.get("installments"));
    const canOverrideInstallments =
      !sale.acceptedAt &&
      sale.plan.service !== "mensal" &&
      Number.isInteger(requestedInstallmentsParam) &&
      requestedInstallmentsParam >= 1 &&
      requestedInstallmentsParam <= maxInstallments;

    let effectiveTotal = s.total;
    let effectiveDiscountType = s.discountType ?? b?.discountType ?? null;
    let effectiveDiscountValue = s.discountValue ?? b?.discountValue ?? null;
    let effectiveInstallments = s.installments;
    let effectiveInstallmentsCount = s.installmentsCount ?? (s.installments || []).length ?? 1;
    const effectiveClauses = s.clauses ? [...s.clauses] : undefined;

    if (useProgressiveDiscounts && progressiveOptions) {
      const targetCount = canOverrideInstallments ? requestedInstallmentsParam : effectiveInstallmentsCount;
      const chosenOpt = progressiveOptions.find((o) => o.count === targetCount) ?? progressiveOptions[0];
      if (chosenOpt) {
        effectiveTotal = chosenOpt.total;
        effectiveDiscountType = "percent";
        effectiveDiscountValue = chosenOpt.discountPercent;
        effectiveInstallments = chosenOpt.installments;
        effectiveInstallmentsCount = chosenOpt.count;
        if (effectiveClauses && effectiveClauses[4]) {
          effectiveClauses[4] = {
            title: effectiveClauses[4].title,
            body: buildPaymentClauseBody(chosenOpt.installments, {
              recurring: false,
              maxInstallments,
              progressiveDiscounts: true,
              baseTotal,
              discountPercent: chosenOpt.discountPercent,
              discountAmount: chosenOpt.discountAmount,
              finalTotal: chosenOpt.total,
            }),
          };
        }
      }
    }

    const data: BudgetPdfData = {
      code: s.code,
      title: s.title,
      status: sale.acceptedAt ? "approved" : b?.status || "sent",
      totalAmount: effectiveTotal,
      baseTotal,
      progressiveDiscounts: useProgressiveDiscounts,
      progressiveOptions,
      installmentsCount: effectiveInstallmentsCount,
      maxInstallments,
      validUntil: s.validUntil ?? b?.validUntil ?? sale.expiresAt,
      terms: s.terms,
      bankInfo: s.bankInfo,
      items: s.items || [],
      createdAt: s.createdAt ?? b?.createdAt ?? new Date().toISOString(),
      contactName: profile.contactName || c?.name || s.clientName,
      contactEmail: profile.email || c?.email || null,
      contactPhone: profile.phone || c?.phone || null,
      contactCompany: profile.companyName || s.clientCompany || c?.company || null,
      clientName: s.clientName,
      clientCompany: profile.companyName || s.clientCompany || c?.company || null,
      clientDocument: profile.document || s.clientDocument || c?.document || null,
      contactDocument: profile.document || c?.document || s.clientDocument || null,
      contactLegalName: profile.legalName || c?.legalName || null,
      contactAddress: addressParts || null,
      eventDates: s.eventDates,
      discountType: effectiveDiscountType,
      discountValue: effectiveDiscountValue,
      paymentCondition:
        effectiveInstallmentsCount > 1
          ? "installments"
          : (s.paymentCondition ?? sale.plan.paymentCondition ?? b?.paymentCondition ?? "cash"),
      deliveryDeadline:
        s.deliveryDeadline ??
        sale.plan.deliveryDeadline ??
        b?.deliveryDeadline ??
        `${sale.plan.startDate.split("-").reverse().join("/")} a ${sale.plan.deliveryDate.split("-").reverse().join("/")}`,
      revisionsCount: s.revisionsCount ?? b?.revisionsCount ?? 2,
      subtype: s.subtype ?? sale.plan.subtype ?? inferred.subtype,
      applyCashDiscount: Boolean(s.applyCashDiscount ?? sale.plan.applyCashDiscount),
      customClauses: effectiveClauses,
      customInstallments: effectiveInstallments,
      acceptance: acceptance
        ? {
            signerName: acceptance.signerName,
            acceptedAt: acceptance.acceptedAt,
            verificationCode: acceptance.code,
            budgetVersion: acceptance.budgetVersion,
          }
        : null,
    };

    const buf = await renderBudgetPdf(data);
    const cleanCode = (s.code || "proposta").replace(/[^a-zA-Z0-9_-]/g, "");
    const prefix =
      docKind === "contrato"
        ? "contrato-formalizado"
        : sale.acceptedAt
          ? "proposta-aceita"
          : "proposta-comercial";
    const fileName = `${prefix}-${cleanCode}.pdf`;

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return serverError(e);
  }
}

