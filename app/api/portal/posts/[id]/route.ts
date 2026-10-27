import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { PostError, decidePost, updateClientPost } from "@/lib/kbos/social-posts";
import { POST_FORMATS } from "@/lib/kbos/social-import";
import { notifyDecision } from "@/lib/kbos/social-notify";

export const dynamic = "force-dynamic";
const body = z.object({ decision: z.enum(["aprovar", "ajustes"]), note: z.string().max(1000).nullable().optional() });
type Ctx = { params: Promise<{ id: string }> };

// POST /api/portal/posts/:id — o cliente aprova ou pede ajustes (só no post dele).
export async function POST(req: Request, ctx: Ctx) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
    const parsed = await readBody(req, body);
    if ("error" in parsed) return parsed.error;
    const post = await decidePost(user.id, id, parsed.data.decision, parsed.data.note);
    await notifyDecision(post, parsed.data.decision);
    return NextResponse.json({ ok: true, status: post.status });
  } catch (e) {
    if (e instanceof PostError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}

const edit = z.object({
  title: z.string().min(2).max(200).optional(),
  brand: z.string().max(60).nullable().optional(),
  collabBrands: z.array(z.string().min(1).max(60)).max(2).optional(),
  format: z.enum(POST_FORMATS).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  networks: z.array(z.string().max(30)).max(10).optional(),
  script: z.string().max(30000).nullable().optional(),
  caption: z.string().max(5000).nullable().optional(),
  status: z.enum(["roteiro", "cancelado"]).optional(),
});

// PATCH /api/portal/posts/:id — gestão de conteúdo edita/cancela; quem só acompanha, o próprio roteiro.
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
    const parsed = await readBody(req, edit);
    if ("error" in parsed) return parsed.error;
    const post = await updateClientPost(user.id, id, parsed.data);
    return NextResponse.json({ ok: true, status: post.status });
  } catch (e) {
    if (e instanceof PostError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
