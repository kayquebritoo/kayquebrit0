import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { budgets, contacts, conversations, deals, projects, showcases, tasks, transactions } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { buildSummary, buildTimeline } from "@/lib/kbos/client360";

export const dynamic = "force-dynamic";

// GET /api/admin/contacts/:id/360 — tudo do cliente numa tela (admin: tem valores).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const d = db();
    const [contact] = await d.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    if (!contact) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    const [dl, bd, pj, tx, tk, cv, cs] = await Promise.all([
      d.select({ id: deals.id, title: deals.title, stage: deals.stage, value: deals.value, createdAt: deals.createdAt }).from(deals).where(eq(deals.contactId, id)),
      d.select({ id: budgets.id, code: budgets.code, title: budgets.title, status: budgets.status, totalAmount: budgets.totalAmount, createdAt: budgets.createdAt }).from(budgets).where(eq(budgets.contactId, id)),
      d.select({ id: projects.id, titulo: projects.titulo, categoria: projects.categoria, status: projects.status, valor: projects.valor, prazo: projects.prazo, createdAt: projects.createdAt }).from(projects).where(eq(projects.contactId, id)),
      d.select({ id: transactions.id, tipo: transactions.tipo, descricao: transactions.descricao, valor: transactions.valor, status: transactions.status, vencimento: transactions.vencimento, createdAt: transactions.createdAt }).from(transactions).where(eq(transactions.contactId, id)),
      d.select({ id: tasks.id, titulo: tasks.titulo, status: tasks.status, dueAt: tasks.dueAt, createdAt: tasks.createdAt }).from(tasks).where(eq(tasks.contactId, id)),
      d.select({ id: conversations.id, channel: conversations.channel, lastMessageAt: conversations.lastMessageAt, lastPreview: conversations.lastPreview, createdAt: conversations.createdAt }).from(conversations).where(eq(conversations.contactId, id)),
      d.select({ id: showcases.id, title: showcases.title, status: showcases.status, createdAt: showcases.createdAt }).from(showcases).where(eq(showcases.contactId, id)),
    ]);
    const input = { deals: dl, budgets: bd, projects: pj, transactions: tx, tasks: tk, conversations: cv, cases: cs };
    return NextResponse.json({
      contact,
      summary: buildSummary(input),
      timeline: buildTimeline(input).slice(0, 80),
    });
  } catch (e) {
    return serverError(e);
  }
}
