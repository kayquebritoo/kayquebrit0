import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { budgets } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { budgetPatchSchema, checkId, readBody } from "@/lib/kbos/validators";
import { calcBudgetWithDiscount, type BudgetItem } from "@/lib/kbos/budgets";
import { serverError } from "@/lib/kbos/http";

// /api/budgets/[id] — detalhe, atualização e exclusão (admin).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const row = (await db().select().from(budgets).where(eq(budgets.id, id)).limit(1))[0];
    if (!row) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    return NextResponse.json({ item: row });
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const parsed = await readBody(req, budgetPatchSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const current = (await db().select().from(budgets).where(eq(budgets.id, id)).limit(1))[0];
    if (!current) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (b.title !== undefined) patch.title = b.title;
    if (b.contactId !== undefined) patch.contactId = b.contactId;
    if (b.status !== undefined) patch.status = b.status;
    if (b.validUntil !== undefined) patch.validUntil = b.validUntil ? new Date(b.validUntil) : null;
    if (b.terms !== undefined) patch.terms = b.terms;
    if (b.bankInfo !== undefined) patch.bankInfo = b.bankInfo;
    if (b.clientName !== undefined) patch.clientName = b.clientName?.trim() || null;
    if (b.clientCompany !== undefined) patch.clientCompany = b.clientCompany?.trim() || null;
    if (b.clientDocument !== undefined) patch.clientDocument = b.clientDocument?.trim() || null;
    if (b.eventDates !== undefined) {
      patch.eventDates =
        b.eventDates && b.eventDates.length
          ? b.eventDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
          : null;
    }
    if (b.discountType !== undefined) patch.discountType = b.discountType;
    if (b.discountValue !== undefined) patch.discountValue = b.discountValue != null ? String(b.discountValue) : null;
    if (b.paymentCondition !== undefined) patch.paymentCondition = b.paymentCondition;
    if (b.deliveryDeadline !== undefined) patch.deliveryDeadline = b.deliveryDeadline?.trim() || null;
    if (b.revisionsCount !== undefined) patch.revisionsCount = b.revisionsCount;
    // Itens e/ou desconto mudaram → recalcula subtotal, desconto e total
    // final a partir do estado resultante (novo + atual).
    if (b.items !== undefined || b.discountType !== undefined || b.discountValue !== undefined) {
      const itemsInput: BudgetItem[] =
        b.items !== undefined
          ? b.items.map((i) => ({
              service: i.service,
              description: i.description ?? null,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              total: i.quantity * i.unitPrice,
              date: i.date ?? null,
            }))
          : (current.items as BudgetItem[]) || [];
      const { items, total } = calcBudgetWithDiscount(
        itemsInput,
        b.discountType !== undefined ? b.discountType : (current.discountType as never),
        b.discountValue !== undefined ? b.discountValue : Number(current.discountValue || 0)
      );
      patch.items = items;
      patch.totalAmount = String(total);
    }
    const rows = await db().update(budgets).set(patch).where(eq(budgets.id, id)).returning();
    if (!rows[0]) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, item: rows[0] });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const rows = await db().delete(budgets).where(eq(budgets.id, id)).returning({ id: budgets.id });
    if (!rows[0]) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
