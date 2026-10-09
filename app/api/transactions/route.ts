import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { transactions } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody, transactionCreateSchema } from "@/lib/kbos/validators";

// ERP básico — só admin. Filtros: ?tipo=entrada|saida&status=pendente|pago|vencido
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const q = new URL(req.url).searchParams;
    const rows = await db().select().from(transactions).orderBy(desc(transactions.createdAt)).limit(300);
    const tipo = q.get("tipo");
    const status = q.get("status");
    const items = rows.filter(
      (r) => (!tipo || r.tipo === tipo) && (!status || r.status === status)
    );
    const sum = (xs: typeof rows) => xs.reduce((a, r) => a + Number(r.valor || 0), 0);
    const entradas = sum(rows.filter((r) => r.tipo === "entrada" && r.status === "pago"));
    const saidas = sum(rows.filter((r) => r.tipo === "saida" && r.status === "pago"));
    const aReceber = sum(rows.filter((r) => r.tipo === "entrada" && r.status !== "pago"));
    const aPagar = sum(rows.filter((r) => r.tipo === "saida" && r.status !== "pago"));
    return NextResponse.json({ items, resumo: { entradas, saidas, saldo: entradas - saidas, aReceber, aPagar } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, transactionCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const rows = await db()
      .insert(transactions)
      .values({
        tipo: b.tipo,
        descricao: b.descricao,
        categoria: b.categoria ?? null,
        valor: b.valor,
        vencimento: b.vencimento ? new Date(b.vencimento) : null,
        status: b.status ?? "pendente",
        projectId: b.projectId ?? null,
      })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
