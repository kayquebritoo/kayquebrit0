import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { tasks } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// GET ?projectId= — tarefas do projeto (dono ou equipe).
export async function GET(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId obrigatório." }, { status: 400 });
  const rows = await db()
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(desc(tasks.createdAt));
  return NextResponse.json({ items: rows });
}

// POST: cria tarefa (equipe).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const body = await req.json();
    if (!body.projectId || !body.titulo) {
      return NextResponse.json({ error: "projectId e titulo são obrigatórios." }, { status: 400 });
    }
    const rows = await db()
      .insert(tasks)
      .values({
        projectId: body.projectId,
        titulo: String(body.titulo),
        responsavelRole: body.responsavelRole || null,
        estimativaMin: body.estimativaMin ? Number(body.estimativaMin) : null,
      })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
