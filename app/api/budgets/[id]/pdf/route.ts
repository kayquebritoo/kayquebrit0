import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { budgets, contacts } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId } from "@/lib/kbos/validators";
import { renderBudgetPdf, type BudgetPdfData } from "@/lib/kbos/pdf-generator";

export const dynamic = "force-dynamic";

// GET /api/budgets/[id]/pdf — baixa o orçamento em PDF estilizado (admin).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const row = (
      await db()
        .select({ budget: budgets, contact: contacts })
        .from(budgets)
        .leftJoin(contacts, eq(budgets.contactId, contacts.id))
        .where(eq(budgets.id, id))
        .limit(1)
    )[0];
    if (!row) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    const data: BudgetPdfData = {
      code: row.budget.code,
      title: row.budget.title,
      status: row.budget.status,
      totalAmount: row.budget.totalAmount,
      validUntil: row.budget.validUntil,
      terms: row.budget.terms,
      bankInfo: row.budget.bankInfo,
      items: row.budget.items || [],
      createdAt: row.budget.createdAt,
      contactName: row.contact?.name ?? null,
      contactEmail: row.contact?.email ?? null,
      contactPhone: row.contact?.phone ?? null,
      contactCompany: row.contact?.company ?? null,
    };
    const buf = await renderBudgetPdf(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="orcamento-${row.budget.code.replace("#", "")}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
