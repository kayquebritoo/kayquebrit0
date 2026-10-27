import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { overduePosts } from "@/lib/kbos/social-posts";

export const dynamic = "force-dynamic";

// GET /api/posts/overdue — atrasados do mês corrente de quem está logado: { month, total, hidden, items }.
// `total` é o mesmo número do "Atrasados" do relatório do mês (cliente: os dele; equipe: os seus; admin: todos).
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json(await overduePosts(user));
  } catch (e) {
    return serverError(e);
  }
}
