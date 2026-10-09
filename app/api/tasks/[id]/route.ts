import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { tasks } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody, taskPatchSchema } from "@/lib/kbos/validators";

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
    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) patch.status = body.status;
    if (body.titulo !== undefined) patch.titulo = body.titulo;
    await db().update(tasks).set(patch).where(eq(tasks.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

