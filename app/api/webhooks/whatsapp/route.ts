import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { notifications } from "@/lib/kbos/schema";

// Webhook de status de entrega (Evolution API) — atualiza a fila/outbox.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { notificationId, status, erro } = body;
    if (!notificationId) return NextResponse.json({ error: "notificationId obrigatório." }, { status: 400 });
    if (!["enviado", "falha"].includes(status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    await db()
      .update(notifications)
      .set({ status, erro: erro || null })
      .where(eq(notifications.id, notificationId));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
