import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { notifyChatMessage } from "@/lib/kbos/chat-notify";
import { canAccessProject, cleanBody, listMessages, markRead, postMessage, CHAT_MAX_LEN } from "@/lib/kbos/project-chat";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(ctx: Ctx): Promise<Response | { user: NonNullable<Awaited<ReturnType<typeof sessionUser>>>; id: string }> {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id) || !(await canAccessProject(user, id))) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  return { user, id };
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const g = await guard(ctx);
    if (g instanceof Response) return g;
    const items = await listMessages(g.id);
    await markRead(g.user.id, g.id);
    return NextResponse.json({ items, me: g.user.id });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const g = await guard(ctx);
    if (g instanceof Response) return g;
    const data = (await req.json().catch(() => ({}))) as { body?: unknown };
    const body = cleanBody(data.body);
    if (!body) return NextResponse.json({ error: `Escreva uma mensagem de até ${CHAT_MAX_LEN} caracteres.` }, { status: 400 });
    const row = await postMessage(g.user, g.id, body);
    await notifyChatMessage(g.user, g.id);
    return NextResponse.json({ item: row }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
