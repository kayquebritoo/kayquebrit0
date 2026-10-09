import { NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { enrollments, transactions } from "@/lib/kbos/schema";
import { notifyProject } from "@/lib/kbos/whatsapp";
import { badRequest, mpNotificationSchema, readBody } from "@/lib/kbos/validators";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { fetchMpPayment, parseSignatureHeader, verifyMpSignature } from "@/lib/kbos/mercadopago";
import { buildIdempotencyKey, enqueueJob } from "@/lib/kbos/jobs";

// Webhook Mercado Pago — baixa automática com HMAC real.
// Ativação: preferência com `external_reference = <transactionId>`, esta URL
// cadastrada no painel do MP e MP_WEBHOOK_SECRET definido.
// Sem o secret → 503 (fail-closed: dinheiro sem autenticar não entra).
export async function POST(req: Request) {
  const limited = await withRateLimit(req, "webhooks:mp");
  if (limited) return limited;

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook de pagamento não configurado." }, { status: 503 });
  }

  const parsed = await readBody(req, mpNotificationSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  const dataId = String(body.data?.id ?? "");
  const sig = parseSignatureHeader(req.headers.get("x-signature"));
  const requestId = req.headers.get("x-request-id") || "";
  if (!dataId || !sig || !verifyMpSignature({ dataId, requestId, ts: sig.ts, v1: sig.v1, secret })) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  // Só pagamento interessa; o resto (merchant_order etc.) é ack silencioso.
  if (body.type !== undefined && body.type !== "payment") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    // Assinatura válida, mas sem credencial não há como confirmar o status:
    // ack (evita retry do MP) sem aplicar baixa.
    return NextResponse.json({ ok: true, verified: true, applied: false, reason: "sem credencial de consulta" });
  }

  const payment = await fetchMpPayment(dataId, token);
  if (!payment) {
    return NextResponse.json({ error: "Pagamento não encontrado no gateway." }, { status: 502 });
  }
  if (payment.status !== "approved") {
    return NextResponse.json({ ok: true, verified: true, applied: false, reason: payment.status });
  }

  // Ramo LMS: preferência criada com external_reference = `lms:<enrollmentId>`.
  // Confirma a matrícula e dispara as boas-vindas via worker (idempotente).
  const d = db();
  const ext = payment.external_reference;
  if (ext?.startsWith("lms:")) {
    const enrollmentId = ext.slice(4);
    const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(enrollmentId);
    const enr = uuidOk
      ? (await d.select().from(enrollments).where(eq(enrollments.id, enrollmentId)).limit(1))[0]
      : undefined;
    if (!enr) {
      return NextResponse.json({ ok: true, verified: true, applied: false, reason: "matrícula LMS não encontrada" });
    }
    if (enr.status === "ativa" || enr.status === "concluida") {
      return NextResponse.json({ ok: true, verified: true, applied: true, duplicate: true });
    }
    if (enr.status === "cancelada") {
      return NextResponse.json({ ok: true, verified: true, applied: false, reason: "matrícula cancelada" });
    }
    await d.update(enrollments).set({ status: "ativa", updatedAt: new Date() }).where(eq(enrollments.id, enr.id));
    const w = await enqueueJob(
      "lms.welcome",
      { enrollmentId: enr.id },
      { key: buildIdempotencyKey("lms-welcome", { enrollment: enr.id }) }
    );
    return NextResponse.json({ ok: true, verified: true, applied: true, via: "lms", welcome: w.queued });
  }

  // Localiza a transação: external_reference (preferência) ou gatewayRef.
  // (external_reference só entra na query se for uuid — senão o Postgres erra.)
  const extIsUuid =
    !!ext && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ext);
  const row = (
    await d
      .select()
      .from(transactions)
      .where(
        or(
          ...(extIsUuid ? [eq(transactions.id, ext as string)] : []),
          eq(transactions.gatewayRef, payment.id)
        )
      )
      .limit(1)
  )[0];
  if (!row) {
    return NextResponse.json({ ok: true, verified: true, applied: false, reason: "transação local não encontrada" });
  }
  if (row.status === "pago") return NextResponse.json({ ok: true, applied: true, duplicate: true });
  await d
    .update(transactions)
    .set({ status: "pago", gatewayRef: payment.id })
    .where(eq(transactions.id, row.id));
  if (row.projectId) {
    await notifyProject(row.projectId, "pagamento", `Pagamento confirmado: *${row.descricao}* ✅`);
  }
  return NextResponse.json({ ok: true, verified: true, applied: true });
}

// GET de verificação rápida (o MP valida a URL com GET em alguns fluxos).
export async function GET() {
  if (!process.env.MP_WEBHOOK_SECRET) {
    return badRequest("Webhook de pagamento não configurado.");
  }
  return NextResponse.json({ ok: true });
}
