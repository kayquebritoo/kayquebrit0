import { NextResponse } from "next/server";
import { gte } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts, projects, transactions } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { clientProfit, periodRange } from "@/lib/kbos/client-profit";

export const dynamic = "force-dynamic";

const KINDS = ["mes", "mes-passado", "12m", "ano", "ano-passado"];

// GET /api/admin/reports/clients?periodo=mes|mes-passado|12m|ano|ano-passado&scope=empresa|pessoal|tudo (admin)
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const url = new URL(req.url);
    const kind = KINDS.includes(url.searchParams.get("periodo") ?? "") ? url.searchParams.get("periodo")! : "mes";
    const s = url.searchParams.get("scope");
    const scope = s === "pessoal" || s === "tudo" ? s : "empresa";
    const { from, to, label } = periodRange(kind);
    // Busca desde 2 períodos atrás para poder comparar com o período anterior.
    const since = new Date(from.getTime() - 2 * (to.getTime() - from.getTime()));
    const d = db();
    const [trx, proj, people] = await Promise.all([
      d.select({
        tipo: transactions.tipo, valor: transactions.valor, status: transactions.status, scope: transactions.scope,
        vencimento: transactions.vencimento, createdAt: transactions.createdAt, projectId: transactions.projectId, contactId: transactions.contactId,
      }).from(transactions).where(gte(transactions.createdAt, new Date(since.getTime() - 400 * 86_400_000))),
      d.select({ id: projects.id, contactId: projects.contactId }).from(projects),
      d.select({ id: contacts.id, name: contacts.name, company: contacts.company, status: contacts.status, photoUrl: contacts.photoUrl }).from(contacts),
    ]);
    return NextResponse.json({ periodo: kind, label, scope, ...clientProfit(trx, proj, people, from, to, scope) });
  } catch (e) {
    return serverError(e);
  }
}
