import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { courses } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { courseCreateSchema, readBody } from "@/lib/kbos/validators";
import { uniqueSlug, isConflict } from "@/lib/kbos/lms";
import { serverError } from "@/lib/kbos/http";

// Alias administrativo de `/api/lms/courses` (Fase 1: UI de Projetos/Cursos
// consome `/api/courses`; o LMS segue em `/api/lms/courses`). Protegido por
// admin/bypass via `deny` + proxy.
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const rows = await db().select().from(courses).orderBy(desc(courses.updatedAt)).limit(200);
    return NextResponse.json({ items: rows });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, courseCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const slug = b.slug ?? (await uniqueSlug(b.titulo));
    try {
      const rows = await db()
        .insert(courses)
        .values({
          titulo: b.titulo,
          slug,
          descricao: b.descricao ?? null,
          preco: b.preco ?? null,
          capa: b.capa ?? b.thumbnailUrl ?? null,
          thumbnailUrl: b.thumbnailUrl ?? b.capa ?? null,
          status: b.status ?? "rascunho",
        })
        .returning();
      return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
    } catch (e) {
      if (isConflict(e)) return NextResponse.json({ error: "Slug já em uso." }, { status: 409 });
      throw e;
    }
  } catch (e) {
    return serverError(e);
  }
}
