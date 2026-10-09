import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/kbos/rbac";
import { checkId, progressCompleteSchema, readBody } from "@/lib/kbos/validators";
import { completeLesson, getProgressSummary, LmsError, lmsStatus } from "@/lib/kbos/lms";

// GET ?enrollmentId= — resumo de progresso + aulas (trava de drip/conteúdo).
export async function GET(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const enrollmentId = new URL(req.url).searchParams.get("enrollmentId");
  if (!enrollmentId) return NextResponse.json({ error: "enrollmentId obrigatório." }, { status: 400 });
  const bad = checkId(enrollmentId);
  if (bad) return bad;
  try {
    const summary = await getProgressSummary(enrollmentId, { id: user.id, role: user.role });
    return NextResponse.json(summary);
  } catch (e) {
    if (e instanceof LmsError) return NextResponse.json({ error: e.message }, { status: lmsStatus(e.code) });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// POST {enrollmentId, lessonId} — marca aula concluída (idempotente).
export async function POST(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const parsed = await readBody(req, progressCompleteSchema);
    if ("error" in parsed) return parsed.error;
    const summary = await completeLesson(parsed.data.enrollmentId, parsed.data.lessonId, {
      id: user.id,
      role: user.role,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    if (e instanceof LmsError) return NextResponse.json({ error: e.message }, { status: lmsStatus(e.code) });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
