import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { PostError, setPostTakes } from "@/lib/kbos/social-posts";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const take = z.object({ id: z.number().int().positive(), nome: z.string().max(200), thumb: z.string().max(500).nullable().optional(), t: z.number().nullable().optional(), by: z.string().max(80).nullable().optional(), at: z.string().max(40).optional() });

// PUT /api/portal/posts/:id/takes { takes: [...] } — takes do Lume escolhidos para o conteúdo (substitui a lista).
export async function PUT(req: Request, ctx: Ctx) {
  const user = await sessionUser();
  const denied = deny(user, "cliente", "admin");
  if (denied || !user) return denied!;
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
    const parsed = await readBody(req, z.object({ takes: z.array(take).max(40) }));
    if ("error" in parsed) return parsed.error;
    const takes = parsed.data.takes.map((t) => ({ id: t.id, nome: t.nome, thumb: null, t: t.t ?? null, by: t.by ?? null, at: t.at ?? "" }));
    const post = await setPostTakes(id, takes, { userId: user.id, name: user.name, admin: user.role === "admin" });
    return NextResponse.json({ ok: true, takes: post.takes });
  } catch (e) {
    if (e instanceof PostError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
