import { NextResponse } from "next/server";
import { and, gte, inArray, lt } from "drizzle-orm";
import { projectFamily } from "@/lib/kbos/project-family";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { db } from "@/lib/kbos/db";
import { socialPosts } from "@/lib/kbos/schema";
import { serverError } from "@/lib/kbos/http";
import { reviewContent } from "@/lib/kbos/social-reconciliation";

export const dynamic = "force-dynamic";

/** Consulta somente leitura. Nenhum agrupamento é aplicado por esta rota. */
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const query = new URL(req.url).searchParams;
  const projectId = query.get("projectId") ?? "";
  const month = query.get("month") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "Escolha um projeto e um mês válidos." }, { status: 400 });
  }
  const [year, number] = month.split("-").map(Number);
  const from = new Date(`${month}-01T00:00:00-03:00`);
  const to = new Date(`${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}-01T00:00:00-03:00`);
  try {
    const rows = await db().select().from(socialPosts).where(and(inArray(socialPosts.projectId, (await projectFamily(projectId)).ids), gte(socialPosts.scheduledAt, from), lt(socialPosts.scheduledAt, to)));
    return NextResponse.json(reviewContent(rows), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError(error);
  }
}
