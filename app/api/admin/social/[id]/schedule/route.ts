import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { db } from "@/lib/kbos/db";
import { socialPosts } from "@/lib/kbos/schema";
import { PublishError, schedulePost, unschedulePost } from "@/lib/kbos/social-publish";
import { listPublications } from "@/lib/kbos/content-cycle";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// POST { quando: "agora" | "data", networks? } — o KBOS publica (o verificador roda a cada minuto).
export async function POST(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
  try {
    const parsed = await readBody(req, z.object({ quando: z.enum(["agora", "data"]), networks: z.array(z.string().max(30)).max(10).optional() }));
    if ("error" in parsed) return parsed.error;
    const [post] = await db().select({ scheduledAt: socialPosts.scheduledAt }).from(socialPosts).where(eq(socialPosts.id, id)).limit(1);
    if (!post) return NextResponse.json({ error: "Post não encontrado." }, { status: 404 });
    const at = parsed.data.quando === "agora" ? new Date() : post.scheduledAt;
    if (!at) return NextResponse.json({ error: "Defina data e hora do post." }, { status: 400 });
    if (parsed.data.quando === "data" && at.getTime() < Date.now() - 60_000) return NextResponse.json({ error: "A data do post já passou. Mude a data ou publique agora." }, { status: 400 });
    const n = await schedulePost(id, { at, networks: parsed.data.networks });
    return NextResponse.json({ ok: true, agendadas: n, at, items: await listPublications([id]) });
  } catch (e) {
    if (e instanceof PublishError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}

// DELETE — tira da fila (o que ainda não começou a sair).
export async function DELETE(_req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await ctx.params;
  try { return NextResponse.json({ ok: true, removidas: await unschedulePost(id), items: await listPublications([id]) }); } catch (e) { return serverError(e); }
}
