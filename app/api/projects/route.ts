import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts, projects, socialPosts, tasks, users } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { projectCreateSchema, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { clientProjectView, clientProjects } from "@/lib/kbos/project-members";

// GET: equipe vê tudo; cliente vê só os próprios.
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const d = db();
    const isClient = user.role === "cliente";
    // Equipe: já vem o nome do cliente e o andamento das tarefas (sem N consultas na tela).
    const base = d
      .select({
        project: projects,
        contactName: contacts.name,
        contactCompany: contacts.company,
        tasksTotal: sql<number>`(select count(*)::int from ${tasks} where ${tasks.projectId} = ${projects.id})`,
        tasksDone: sql<number>`(select count(*)::int from ${tasks} where ${tasks.projectId} = ${projects.id} and ${tasks.status} = 'done')`,
        // ciclo do mês corrente (Belém): o post só vira "postado" quando todas as redes saíram
        monthPosts: sql<number>`(select count(*)::int from ${socialPosts} where ${socialPosts.projectId} = ${projects.id} and ${socialPosts.linkedTo} is null and ${socialPosts.dismissedAt} is null and ${socialPosts.status} <> 'cancelado' and date_trunc('month', ${socialPosts.scheduledAt} at time zone 'America/Belem') = date_trunc('month', now() at time zone 'America/Belem'))`,
        monthDone: sql<number>`(select count(*)::int from ${socialPosts} where ${socialPosts.projectId} = ${projects.id} and ${socialPosts.linkedTo} is null and ${socialPosts.dismissedAt} is null and ${socialPosts.status} = 'postado' and date_trunc('month', ${socialPosts.scheduledAt} at time zone 'America/Belem') = date_trunc('month', now() at time zone 'America/Belem'))`,
      })
      .from(projects)
      .leftJoin(contacts, eq(contacts.id, projects.contactId));
    const joined = isClient
      ? await base.where(clientProjects(user.id)).orderBy(desc(projects.updatedAt))
      : await base.orderBy(desc(projects.updatedAt)).limit(200);
    const rows = joined.map((r) =>
      isClient
        ? clientProjectView(r.project)
        : { ...r.project, contactName: r.contactName, contactCompany: r.contactCompany, tasksTotal: r.tasksTotal, tasksDone: r.tasksDone, monthPosts: r.monthPosts, monthDone: r.monthDone },
    );
    return NextResponse.json({ items: rows });
  } catch (e) {
    return serverError(e);
  }
}

// POST: cria projeto (admin). Pode vincular briefing + cliente por e-mail.
export async function POST(req: Request) {
  const user = await sessionUser();
  const d = deny(user, "admin");
  if (d) return d;
  try {
    const parsed = await readBody(req, projectCreateSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;
    let clienteId: string | null = body.clienteId ?? null;
    let warning: string | null = null;
    if (!clienteId && body.clienteEmail) {
      const cli = (
        await db().select().from(users).where(eq(users.email, body.clienteEmail.toLowerCase())).limit(1)
      )[0];
      clienteId = cli?.id ?? null;
      if (!cli) warning = "Projeto criado, mas ainda não existe conta de portal com esse e-mail: o cliente só o verá depois de entrar pela primeira vez.";
    }
    const rows = await db()
      .insert(projects)
      .values({
        titulo: body.titulo,
        categoria: body.categoria,
        clienteId,
        briefingId: body.briefingId ?? null,
        contactId: body.contactId ?? null,
        valor: body.valor ?? null,
        prazo: body.prazo ? new Date(body.prazo) : null,
        recurring: body.categoria === "social",
        // Fase 1 — vitrine (slug único; 409 amigável em conflito).
        slug: body.slug ?? null,
        description: body.description ?? null,
        coverUrl: body.coverUrl ?? null,
        thumbUrl: body.thumbUrl ?? null,
        videoUrl: body.videoUrl ?? null,
        courseId: body.courseId ?? null,
      })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0], warning }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    if (/slug|unique|duplicate/i.test(msg)) {
      return NextResponse.json({ error: "Slug já em uso." }, { status: 409 });
    }
    return serverError(e);
  }
}
