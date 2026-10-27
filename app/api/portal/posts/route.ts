import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { z } from "zod";
import { db } from "@/lib/kbos/db";
import { projects } from "@/lib/kbos/schema";
import { readBody } from "@/lib/kbos/validators";
import { PostError, createClientRoteiro, monthUsage, portalPosts } from "@/lib/kbos/social-posts";
import { contentFlags, monthMetricsByProject } from "@/lib/kbos/content-cycle";
import { notifyClientRoteiro } from "@/lib/kbos/social-notify";
import { POST_FORMATS } from "@/lib/kbos/social-import";
import { clientProjects, managedProjectIds } from "@/lib/kbos/project-members";
import { planPool } from "@/lib/kbos/plan-pool";

export const dynamic = "force-dynamic";

// GET /api/portal/posts — posts dos projetos do cliente (a partir de "aguardando aprovação").
export async function GET(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const managed = new Set(await managedProjectIds(user.id));
    const mine = (await db().select({ id: projects.id, titulo: projects.titulo, parentId: projects.parentId }).from(projects).where(clientProjects(user.id))).map((p) => ({ ...p, manage: managed.has(p.id) }));
    const month = new URL(req.url).searchParams.get("month") ?? "";
    const valid = /^\d{4}-\d{2}$/.test(month);
    const roots = [...new Set(mine.map((p) => p.parentId ?? p.id))];
    // cliente com operações: o plano é do principal, dividido entre as empresas
    const pools = valid ? (await Promise.all(roots.map((r) => planPool(r, month)))).filter((p) => p && p.ops.length).map((p) => ({ ...p!, manage: managed.has(p!.rootId) })) : [];
    const quota = valid && mine[0] && !pools.length ? await monthUsage(mine[0].id, month) : null;
    // números do mês com a MESMA regra do relatório e do admin (o principal soma as operações)
    let summary: { total: number; published: number; late: number } | null = null;
    if (valid && roots.length) {
      const m = await monthMetricsByProject(roots, month);
      summary = [...m.values()].reduce((s, x) => ({ total: s.total + x.previstos, published: s.published + x.publicados, late: s.late + x.atrasados }), { total: 0, published: 0, late: 0 });
    }
    return NextResponse.json({ items: await contentFlags(await portalPosts(user.id)), projects: mine, quota, pools, summary });
  } catch (e) {
    return serverError(e);
  }
}

const create = z.object({ projectId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), title: z.string().min(2).max(200), format: z.enum(POST_FORMATS), brand: z.string().max(60).nullable().optional(), collabBrands: z.array(z.string().min(1).max(60)).max(2).optional(), script: z.string().max(30000).nullable().optional(), caption: z.string().max(5000).nullable().optional(), networks: z.array(z.string().max(30)).max(10).optional() });

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
