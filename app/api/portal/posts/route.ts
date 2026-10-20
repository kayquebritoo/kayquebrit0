import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { portalPosts } from "@/lib/kbos/social-posts";

export const dynamic = "force-dynamic";

// GET /api/portal/posts — posts dos projetos do cliente (a partir de "aguardando aprovação").
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json({ items: await portalPosts(user.id) });
  } catch (e) {
    return serverError(e);
  }
}
