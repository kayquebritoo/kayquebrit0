import { NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts, projects, tasks } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody, taskCreateSchema } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;
const isStaff = (role: string) => (STAFF as readonly string[]).includes(role);

// GET ?projectId= — tarefas do projeto (equipe, ou o cliente dono do projeto).
// GET sem projectId — todas as tarefas (equipe): abertas por prazo, depois as
// feitas nos últimos 14 dias. `?open=1` traz só as abertas.
export async function GET(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (projectId) {
      const bad = checkId(projectId);
      if (bad) return bad;
      if (!isStaff(user.role)) {
        // Cliente só vê tarefas dos próprios projetos.
        const own = await db()
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.clienteId, user.id)))
          .limit(1);
        if (!own[0]) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
      }
      const rows = await db().select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(desc(tasks.createdAt));
      return NextResponse.json({ items: rows });
    }
    if (!isStaff(user.role)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    const onlyOpen = url.searchParams.get("open") === "1";
    const rows = await db()
      .select({
        id: tasks.id,
        titulo: tasks.titulo,
        status: tasks.status,
        dueAt: tasks.dueAt,
        description: tasks.description,
        assignee: tasks.assignee,
        priority: tasks.priority,
        projectId: tasks.projectId,
        contactId: tasks.contactId,
        doneAt: tasks.doneAt,
        createdAt: tasks.createdAt,
        projectTitle: projects.titulo,
        contactName: contacts.name,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .where(
        onlyOpen
          ? sql`${tasks.status} <> 'done'`
          : sql`(${tasks.status} <> 'done' OR ${tasks.doneAt} > now() - interval '14 days')`
      )
      .orderBy(sql`${tasks.status} = 'done'`, asc(sql`coalesce(${tasks.dueAt}, 'infinity'::timestamptz)`), desc(tasks.createdAt))
      .limit(500);
    return NextResponse.json({ items: rows });
  } catch (e) {
    return serverError(e);
  }
}

// POST: cria tarefa (equipe). Projeto é opcional.
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const parsed = await readBody(req, taskCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const done = b.status === "done";
    const rows = await db()
      .insert(tasks)
      .values({
        projectId: b.projectId ?? null,
        titulo: b.titulo,
        responsavelRole: b.responsavelRole ?? null,
        estimativaMin: b.estimativaMin ?? null,
        status: b.status ?? "todo",
        dueAt: b.dueAt ? new Date(b.dueAt) : null,
        description: b.description || null,
        assignee: b.assignee || null,
        priority: b.priority ?? "normal",
        contactId: b.contactId ?? null,
        doneAt: done ? new Date() : null,
      })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
