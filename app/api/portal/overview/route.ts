import { NextResponse } from "next/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { projects, tasks, transactions } from "@/lib/kbos/schema";
import { sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { unreadByProject } from "@/lib/kbos/project-chat";

// Visão do cliente: só o que é dele (projetos onde ele é o cliente).
// Cobranças = entradas desses projetos; nada de custo, margem ou outros clientes.
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const mine = await db().select({ id: projects.id }).from(projects).where(eq(projects.clienteId, user.id));
    const ids = mine.map((p) => p.id);
    if (ids.length === 0) return NextResponse.json({ tasks: [], invoices: [], unread: {} });
    const [taskRows, invoiceRows, unread] = await Promise.all([
      db()
        .select({ id: tasks.id, projectId: tasks.projectId, titulo: tasks.titulo, status: tasks.status, dueAt: tasks.dueAt })
        .from(tasks)
        .where(inArray(tasks.projectId, ids))
        .orderBy(asc(tasks.dueAt))
        .limit(60),
      db()
        .select({ id: transactions.id, projectId: transactions.projectId, descricao: transactions.descricao, valor: transactions.valor, status: transactions.status, vencimento: transactions.vencimento })
        .from(transactions)
        .where(and(eq(transactions.tipo, "entrada"), inArray(transactions.projectId, ids)))
        .orderBy(desc(transactions.vencimento))
        .limit(60),
      unreadByProject(user.id, ids),
    ]);
    return NextResponse.json({ tasks: taskRows, invoices: invoiceRows, unread });
  } catch (e) {
    return serverError(e);
  }
}
