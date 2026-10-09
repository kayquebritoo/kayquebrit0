import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { certificates, enrollments } from "@/lib/kbos/schema";
import { sessionUser } from "@/lib/kbos/rbac";
import { checkId } from "@/lib/kbos/validators";
import { ensureCertificate } from "@/lib/kbos/lms";

// GET ?enrollmentId= — certificado (emite na hora se 100% e ainda não emitido).
export async function GET(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const enrollmentId = new URL(req.url).searchParams.get("enrollmentId");
  if (!enrollmentId) return NextResponse.json({ error: "enrollmentId obrigatório." }, { status: 400 });
  const bad = checkId(enrollmentId);
  if (bad) return bad;
  try {
    const enr = (
      await db().select().from(enrollments).where(eq(enrollments.id, enrollmentId)).limit(1)
    )[0];
    if (!enr) return NextResponse.json({ error: "Matrícula não encontrada." }, { status: 404 });
    if (user.role === "cliente" && enr.userId !== user.id) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    const existing = (
      await db().select().from(certificates).where(eq(certificates.enrollmentId, enr.id)).limit(1)
    )[0];
    if (existing) return NextResponse.json({ item: existing });
    if (enr.status !== "concluida") {
      return NextResponse.json(
        { error: "Conclua 100% das aulas para emitir o certificado.", progressoPct: enr.progressoPct },
        { status: 409 }
      );
    }
    const cert = await ensureCertificate(enr.id);
    return NextResponse.json({ item: cert }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
