import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { transactions } from "@/lib/kbos/schema";
import { sessionUser } from "@/lib/kbos/rbac";
import { checkId, checkoutSchema, readBody } from "@/lib/kbos/validators";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { createCheckoutEnrollment, LmsError, lmsStatus } from "@/lib/kbos/lms";
import { createMpPreference } from "@/lib/kbos/mercadopago";

// POST {courseId} — checkout: matrícula pendente + transação + preferência MP.
// Preço sempre do banco; external_reference = `lms:<enrollmentId>` ativa
// a matrícula no webhook. Sem credencial MP → 503 (fail-closed).
export async function POST(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const limited = await withRateLimit(req, "lms:checkout");
  if (limited) return limited;
  try {
    const parsed = await readBody(req, checkoutSchema);
    if ("error" in parsed) return parsed.error;
    const bad = checkId(parsed.data.courseId);
    if (bad) return bad;

    // Fail-fast ANTES de qualquer escrita: sem gateway não há o que vender
    // (evita matrícula/transação órfãs no 503).
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Pagamentos ainda não configurados." }, { status: 503 });
    }

    let ready;
    try {
      ready = await createCheckoutEnrollment(user.id, parsed.data.courseId);
    } catch (e) {
      if (e instanceof LmsError) return NextResponse.json({ error: e.message }, { status: lmsStatus(e.code) });
      throw e;
    }

    const pref = await createMpPreference(
      {
        titulo: ready.transaction.descricao,
        preco: Number(ready.transaction.valor),
        externalReference: `lms:${ready.enrollment.id}`,
      },
      token
    );
    if (!pref) {
      return NextResponse.json({ error: "Falha ao gerar o checkout. Tente de novo." }, { status: 502 });
    }
    await db()
      .update(transactions)
      .set({ gatewayRef: pref.id })
      .where(eq(transactions.id, ready.transaction.id));
    return NextResponse.json(
      { ok: true, enrollmentId: ready.enrollment.id, preferenceId: pref.id, init_point: pref.init_point },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
