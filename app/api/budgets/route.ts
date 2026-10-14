import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { budgets, contacts } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { budgetCreateSchema, readBody } from "@/lib/kbos/validators";
import { createBudget } from "@/lib/kbos/budgets";

// Orçamentos — admin-only. Totais recalculados no servidor (`budgets.ts`).
export async function GET() {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const rows = await db()
      .select({
        id: budgets.id,
        code: budgets.code,
        contactId: budgets.contactId,
        title: budgets.title,
        status: budgets.status,
        totalAmount: budgets.totalAmount,
        validUntil: budgets.validUntil,
        terms: budgets.terms,
        bankInfo: budgets.bankInfo,
        items: budgets.items,
        clientName: budgets.clientName,
        clientCompany: budgets.clientCompany,
        eventDates: budgets.eventDates,
        discountType: budgets.discountType,
        discountValue: budgets.discountValue,
        paymentCondition: budgets.paymentCondition,
        deliveryDeadline: budgets.deliveryDeadline,
        revisionsCount: budgets.revisionsCount,
        createdAt: budgets.createdAt,
        updatedAt: budgets.updatedAt,
        contactName: contacts.name,
        contactEmail: contacts.email,
        contactPhone: contacts.phone,
        contactCompany: contacts.company,
      })
      .from(budgets)
      .leftJoin(contacts, eq(budgets.contactId, contacts.id))
      .orderBy(desc(budgets.createdAt))
      .limit(300);
    return NextResponse.json({ items: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, budgetCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const row = await createBudget({
      title: b.title,
      contactId: b.contactId ?? null,
      items: b.items.map((i) => ({
        service: i.service,
        description: i.description ?? null,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.quantity * i.unitPrice,
        date: i.date ?? null,
      })),
      status: b.status,
      validUntil: b.validUntil ? new Date(b.validUntil) : null,
      terms: b.terms ?? null,
      bankInfo: b.bankInfo ?? null,
      clientName: b.clientName ?? null,
      clientCompany: b.clientCompany ?? null,
      eventDates: b.eventDates ?? null,
      discountType: b.discountType ?? null,
      discountValue: b.discountValue ?? null,
      paymentCondition: b.paymentCondition ?? null,
      deliveryDeadline: b.deliveryDeadline ?? null,
      revisionsCount: b.revisionsCount ?? null,
    });
    return NextResponse.json({ ok: true, item: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
