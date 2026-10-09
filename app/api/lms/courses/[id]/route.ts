import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { courses, enrollments } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, coursePatchSchema, readBody } from "@/lib/kbos/validators";
import { getCourseLessons, isConflict } from "@/lib/kbos/lms";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// GET: detalhe + trilha. Conteúdo (vídeo/texto) só p/ matriculados e equipe;
// visitantes veem a estrutura (liberação de conteúdo).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const course = (await db().select().from(courses).where(eq(courses.id, id)).limit(1))[0];
    if (!course) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    const user = await sessionUser().catch(() => null);
    const staff = !!user && (STAFF as readonly string[]).includes(user.role);
    if (course.status !== "publicado" && !staff) {
      return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    }
    let enrolled = false;
    if (user && !staff) {
      const mine = await db().select().from(enrollments).where(eq(enrollments.userId, user.id));
      enrolled = mine.some((e) => e.courseId === id && e.status !== "cancelada");
    }
    const full = staff || enrolled;
    const tree = await getCourseLessons(id);
    return NextResponse.json({
      item: course,
      modulos: tree.map((m) => ({
        ...m.module,
        aulas: m.lessons.map((l) => ({
          id: l.id,
          titulo: l.titulo,
          descricao: l.descricao,
          tipo: l.tipo,
          duracaoMin: l.duracaoMin,
          ordem: l.ordem,
          dripDays: l.dripDays,
          videoUrl: full ? l.videoUrl : null,
          conteudo: full ? l.conteudo : null,
        })),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// PATCH: edita curso (admin).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, coursePatchSchema);
    if ("error" in parsed) return parsed.error;
    try {
      await db().update(courses).set({ ...parsed.data, updatedAt: new Date() }).where(eq(courses.id, id));
      return NextResponse.json({ ok: true });
    } catch (e) {
      if (isConflict(e)) return NextResponse.json({ error: "Slug já em uso." }, { status: 409 });
      throw e;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
