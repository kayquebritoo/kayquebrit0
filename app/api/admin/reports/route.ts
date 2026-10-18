import { NextResponse } from "next/server";
import { gte, sql } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { projects, timeEntries, transactions } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { forecast, meiStatus, monthResult, projectProfit, type Scope } from "@/lib/kbos/reports";

export const dynamic = "force-dynamic";

// GET /api/admin/reports?month=2026-10&scope=empresa|pessoal|tudo (admin)
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const url = new URL(req.url);
    const now = new Date(Date.now() - 3 * 3_600_000); // "agora" em Belém
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(url.searchParams.get("month") ?? "") ? url.searchParams.get("month")! : now.toISOString().slice(0, 7);
    const s = url.searchParams.get("scope");
    const scope: Scope = s === "pessoal" || s === "tudo" ? s : "empresa";

    const d = db();
    const since = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
    const [trx, proj, secs] = await Promise.all([
      d.select({
        tipo: transactions.tipo, valor: transactions.valor, status: transactions.status, scope: transactions.scope,
        categoria: transactions.categoria, vencimento: transactions.vencimento, createdAt: transactions.createdAt, projectId: transactions.projectId,
      }).from(transactions).where(gte(transactions.createdAt, since)),
      d.select({ id: projects.id, titulo: projects.titulo, categoria: projects.categoria, valor: projects.valor }).from(projects),
      d.select({ projectId: timeEntries.projectId, seconds: sql<number>`coalesce(sum(${timeEntries.segundos}), 0)::int` }).from(timeEntries).groupBy(timeEntries.projectId),
    ]);
    const secondsByProject = Object.fromEntries(secs.map((r) => [r.projectId, Number(r.seconds)]));

    return NextResponse.json({
      month,
      scope,
      result: monthResult(trx, proj, month, scope),
      profit: projectProfit(trx, proj, secondsByProject).slice(0, 15),
      forecast: forecast(trx, scope, now),
      mei: meiStatus(trx, now),
    });
  } catch (e) {
    return serverError(e);
  }
}
