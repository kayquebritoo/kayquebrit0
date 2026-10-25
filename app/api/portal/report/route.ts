import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { cycleReport, isMonth } from "@/lib/kbos/content-cycle";
import { isClientOfProject } from "@/lib/kbos/project-members";

export const dynamic = "force-dynamic";

// GET /api/portal/report?projectId=&month= — relatório do mês para o cliente (entregas, aprovações, publicações).
export async function GET(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const projectId = sp.get("projectId") || "";
  const m = sp.get("month");
  const month = isMonth(m) ? m : new Date().toLocaleDateString("sv-SE", { timeZone: "America/Belem" }).slice(0, 7);
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: "Projeto inválido." }, { status: 400 });
  try {
    if (user.role === "cliente" && !(await isClientOfProject(projectId, user.id))) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    const report = await cycleReport(projectId, month);
    if (!report) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    // nomes da equipe interna não saem para o cliente
    return NextResponse.json({ report: { ...report, responsaveis: [] } });
  } catch (e) {
    return serverError(e);
  }
}
