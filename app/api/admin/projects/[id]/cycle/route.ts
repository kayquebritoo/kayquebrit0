import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { CycleError, closeCycle, cycleReport, isMonth, listCycles, reopenCycle } from "@/lib/kbos/content-cycle";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const thisMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Belem" }).slice(0, 7);

// GET ?month=YYYY-MM — indicadores do ciclo mensal (consolida as operações, se houver) + histórico de meses fechados.
export async function GET(req: Request, { params }: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const m = new URL(req.url).searchParams.get("month");
  const month = isMonth(m) ? m : thisMonth();
  try {
    const report = await cycleReport(id, month);
    if (!report) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    const history = (await listCycles(id)).map((c) => ({ month: c.month, status: c.status, closedAt: c.closedAt, summary: c.summary }));
    return NextResponse.json({ report, history });
  } catch (e) {
    return serverError(e);
  }
}

// POST { month, action: "fechar" | "reabrir", note? } — fecha o mês sem encerrar o projeto.
export async function POST(req: Request, { params }: Ctx) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const parsed = await readBody(req, z.object({ month: z.string(), action: z.enum(["fechar", "reabrir"]), note: z.string().max(1000).nullable().optional() }));
    if ("error" in parsed) return parsed.error;
    const { month, action, note } = parsed.data;
    if (!isMonth(month)) return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
    const row = action === "fechar" ? await closeCycle(id, month, user!.id, note) : await reopenCycle(id, month);
    return NextResponse.json({ ok: true, cycle: row });
  } catch (e) {
    if (e instanceof CycleError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
