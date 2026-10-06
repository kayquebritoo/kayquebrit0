import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { tasks } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";

// PATCH: atualiza status/título da tarefa (equipe).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin", "designer", "editor", "fotografo", "programador");
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!["todo", "doing", "done"].includes(body.status)) {
        return NextResponse.json({ error: "Status inválido." }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (body.titulo !== undefined) patch.titulo = String(body.titulo);
    await db().update(tasks).set(patch).where(eq(tasks.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

