import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { tasks } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody, taskPatchSchema } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

// PATCH: atualiza status/título da tarefa (equipe).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin", "designer", "editor", "fotografo", "programador");
  if (denied) return denied;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, taskPatchSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) {
      patch.status = body.status;
      patch.doneAt = body.status === "done" ? new Date() : null;
    }
    if (body.titulo !== undefined) patch.titulo = body.titulo;
    if (body.projectId !== undefined) patch.projectId = body.projectId;
    if (body.dueAt !== undefined) patch.dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (body.description !== undefined) patch.description = body.description || null;
    if (body.assignee !== undefined) patch.assignee = body.assignee || null;
    if (body.priority !== undefined) patch.priority = body.priority;
    if (body.contactId !== undefined) patch.contactId = body.contactId;
    await db().update(tasks).set(patch).where(eq(tasks.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}


// DELETE: remove a tarefa (equipe).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin", "designer", "editor", "fotografo", "programador");
  if (denied) return denied;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    await db().delete(tasks).where(eq(tasks.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
