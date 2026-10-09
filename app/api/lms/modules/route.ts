import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { courses, modules } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, moduleCreateSchema, readBody } from "@/lib/kbos/validators";

// POST: cria módulo no curso (admin).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, moduleCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const bad = checkId(b.courseId);
    if (bad) return bad;
    const course = (await db().select().from(courses).where(eq(courses.id, b.courseId)).limit(1))[0];
    if (!course) return NextResponse.json({ error: "Curso não encontrado." }, { status: 404 });
    const rows = await db()
      .insert(modules)
      .values({ courseId: b.courseId, titulo: b.titulo, ordem: b.ordem ?? 0 })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
