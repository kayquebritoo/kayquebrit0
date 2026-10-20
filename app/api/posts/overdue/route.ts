import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { overduePosts } from "@/lib/kbos/social-posts";

export const dynamic = "force-dynamic";

// GET /api/posts/overdue — posts atrasados de quem está logado (cliente: os dele; equipe: os seus; admin: todos).
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json({ items: await overduePosts(user) });
  } catch (e) {
    return serverError(e);
  }
}
