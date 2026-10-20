import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { listPosts } from "@/lib/kbos/social-posts";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/social?projectId=&month=YYYY-MM&status= — calendário de conteúdo (admin).
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const q = new URL(req.url).searchParams;
    const projectId = q.get("projectId") ?? undefined;
    if (projectId && !UUID.test(projectId)) return NextResponse.json({ error: "Projeto inválido." }, { status: 400 });
    const month = q.get("month");
    let from: Date | undefined, to: Date | undefined;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      from = new Date(`${month}-01T00:00:00-03:00`);
      to = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00-03:00`);
    }
    const items = await listPosts({ projectId, from, to, status: q.get("status") ?? undefined });
    return NextResponse.json({ items });
  } catch (e) {
    return serverError(e);
  }
}
