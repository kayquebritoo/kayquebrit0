import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { notifications } from "@/lib/kbos/schema";
import { readBody, whatsappStatusSchema } from "@/lib/kbos/validators";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { isEvolutionWebhookAuthorized } from "@/lib/kbos/evolution";

// Webhook de status de entrega (Evolution API) — atualiza a fila/outbox.
export async function POST(req: Request) {
  const limited = await withRateLimit(req, "webhooks:wa");
  if (limited) return limited;
  // Mesmo segredo do webhook inbound: sem ele, qualquer um alteraria o
  // status das notificações da fila.
  if (!isEvolutionWebhookAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const parsed = await readBody(req, whatsappStatusSchema);
    if ("error" in parsed) return parsed.error;
    const { notificationId, status, erro } = parsed.data;
    await db()
      .update(notifications)
      .set({ status, erro: erro || null })
      .where(eq(notifications.id, notificationId));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
