import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { lessons, modules } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, lessonCreateSchema, readBody } from "@/lib/kbos/validators";

// POST: cria aula no módulo (admin).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, lessonCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const bad = checkId(b.moduleId);
    if (bad) return bad;
    const mod = (await db().select().from(modules).where(eq(modules.id, b.moduleId)).limit(1))[0];
    if (!mod) return NextResponse.json({ error: "Módulo não encontrado." }, { status: 404 });
    const rows = await db()
      .insert(lessons)
      .values({
        moduleId: b.moduleId,
        titulo: b.titulo,
        descricao: b.descricao ?? null,
        tipo: b.tipo ?? "video",
        videoUrl: b.videoUrl ?? null,
        conteudo: b.conteudo ?? null,
        duracaoMin: b.duracaoMin ?? null,
        ordem: b.ordem ?? 0,
        dripDays: b.dripDays ?? 0,
      })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
