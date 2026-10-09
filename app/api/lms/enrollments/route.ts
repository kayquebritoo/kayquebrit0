import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { courses, enrollments, transactions } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, enrollmentCreateSchema, readBody } from "@/lib/kbos/validators";
import { buildIdempotencyKey, enqueueJob } from "@/lib/kbos/jobs";
import { isConflict } from "@/lib/kbos/lms";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;
const isStaff = (role?: string) => !!role && (STAFF as readonly string[]).includes(role);

// GET: minhas matrículas; equipe vê tudo (filtro ?courseId=).
export async function GET(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const d = db();
    const courseId = new URL(req.url).searchParams.get("courseId");
    if (courseId) {
      const bad = checkId(courseId);
      if (bad) return bad;
    }
    const rows = isStaff(user.role)
      ? await d.select().from(enrollments).orderBy(desc(enrollments.createdAt)).limit(200)
      : await d
          .select()
          .from(enrollments)
          .where(eq(enrollments.userId, user.id))
          .orderBy(desc(enrollments.createdAt));
    const items = courseId ? rows.filter((r) => r.courseId === courseId) : rows;
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// POST: matricula (o próprio aluno; admin pode matricular outro userId).
// Padrão: `pendente` (aguarda pagamento → webhook confirma). Admin pode
// criar direto `ativa`; transação paga vinculada também ativa na hora.
export async function POST(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const parsed = await readBody(req, enrollmentCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const targetUserId = b.userId ?? user.id;
    if (b.userId && b.userId !== user.id) {
      const denied = deny(user, "admin");
      if (denied) return denied;
    }
    const course = (await db().select().from(courses).where(eq(courses.id, b.courseId)).limit(1))[0];
    if (!course) return NextResponse.json({ error: "Curso não encontrado." }, { status: 404 });

    let status: "pendente" | "ativa" = "pendente";
    let transactionId: string | null = null;
    if (b.transactionId) {
      if (user.role !== "admin") {
        return NextResponse.json({ error: "Transação só via admin." }, { status: 403 });
      }
      const trx = (
        await db().select().from(transactions).where(eq(transactions.id, b.transactionId)).limit(1)
      )[0];
      if (!trx) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });
      transactionId = trx.id;
      if (trx.status === "pago") status = "ativa";
    }
    if (b.status === "ativa") {
      const denied = deny(user, "admin");
      if (denied) return denied;
      status = "ativa";
    }

    try {
      const rows = await db()
        .insert(enrollments)
        .values({ courseId: b.courseId, userId: targetUserId, status, transactionId })
        .returning();
      const item = rows[0];
      let welcome: unknown = null;
      if (status === "ativa") {
        const w = await enqueueJob(
          "lms.welcome",
          { enrollmentId: item.id },
          { key: buildIdempotencyKey("lms-welcome", { enrollment: item.id }) }
        );
        welcome = { queued: w.queued, via: w.via };
      }
      return NextResponse.json({ ok: true, item, welcome }, { status: 201 });
    } catch (e) {
      if (isConflict(e)) return NextResponse.json({ error: "Já matriculado neste curso." }, { status: 409 });
      throw e;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
