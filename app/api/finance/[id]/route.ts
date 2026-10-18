import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { transactions } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, financePatchSchema, readBody } from "@/lib/kbos/validators";
import { nextDueDate, toDbPatch, toFinanceEntry } from "@/lib/kbos/finance";
import { serverError } from "@/lib/kbos/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const row = (await db().select().from(transactions).where(eq(transactions.id, id)).limit(1))[0];
  if (!row) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  return NextResponse.json({ item: toFinanceEntry(row) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, financePatchSchema);
    if ("error" in parsed) return parsed.error;
    const before = (await db().select().from(transactions).where(eq(transactions.id, id)).limit(1))[0];
    if (!before) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    await db().update(transactions).set(toDbPatch(parsed.data)).where(eq(transactions.id, id));
    // Recorrente pago agora: já deixa a próxima parcela pendente na fila.
    let next: string | null = null;
    const recurrence = parsed.data.recurrence !== undefined ? parsed.data.recurrence : before.recurrence;
    if (parsed.data.status === "paid" && before.status !== "pago" && (recurrence === "mensal" || recurrence === "anual")) {
      const base = before.vencimento ?? new Date();
      const rows = await db()
        .insert(transactions)
        .values({
          tipo: before.tipo,
          descricao: before.descricao,
          categoria: before.categoria,
          valor: before.valor,
          vencimento: nextDueDate(new Date(base), recurrence),
          status: "pendente",
          scope: before.scope,
          contactId: before.contactId,
          paymentMethod: before.paymentMethod,
          recurrence,
          projectId: before.projectId,
        })
        .returning({ id: transactions.id });
      next = rows[0]?.id ?? null;
    }
    return NextResponse.json({ ok: true, next });
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
  // Matrículas referenciam transação com `set null` — exclusão segura.
  await db().delete(transactions).where(eq(transactions.id, id));
  return NextResponse.json({ ok: true });
}
