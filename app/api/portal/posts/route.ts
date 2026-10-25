import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { z } from "zod";
import { db } from "@/lib/kbos/db";
import { projects } from "@/lib/kbos/schema";
import { readBody } from "@/lib/kbos/validators";
import { PostError, createClientRoteiro, monthUsage, portalPosts } from "@/lib/kbos/social-posts";
import { notifyClientRoteiro } from "@/lib/kbos/social-notify";
import { POST_FORMATS } from "@/lib/kbos/social-import";
import { clientProjects, managedProjectIds } from "@/lib/kbos/project-members";

export const dynamic = "force-dynamic";

// GET /api/portal/posts — posts dos projetos do cliente (a partir de "aguardando aprovação").
export async function GET(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const managed = new Set(await managedProjectIds(user.id));
    const mine = (await db().select({ id: projects.id, titulo: projects.titulo }).from(projects).where(clientProjects(user.id))).map((p) => ({ ...p, manage: managed.has(p.id) }));
    const month = new URL(req.url).searchParams.get("month") ?? "";
    const quota = /^\d{4}-\d{2}$/.test(month) && mine[0] ? await monthUsage(mine[0].id, month) : null;
    return NextResponse.json({ items: await portalPosts(user.id), projects: mine, quota });
  } catch (e) {
    return serverError(e);
  }
}

const create = z.object({ projectId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), title: z.string().min(2).max(200), format: z.enum(POST_FORMATS), brand: z.string().max(60).nullable().optional(), script: z.string().max(30000).nullable().optional(), caption: z.string().max(5000).nullable().optional(), networks: z.array(z.string().max(30)).max(10).optional() });

// POST /api/portal/posts — o cliente cadastra um roteiro no calendário (só nos projetos dele).
export async function POST(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const parsed = await readBody(req, create);
    if ("error" in parsed) return parsed.error;
    const post = await createClientRoteiro(user.id, parsed.data);
    await notifyClientRoteiro(post);
    return NextResponse.json({ ok: true, id: post.id });
  } catch (e) {
    if (e instanceof PostError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
