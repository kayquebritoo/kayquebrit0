import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { transactions } from "@/lib/kbos/schema";
import { notifyProject } from "@/lib/kbos/whatsapp";

// Webhook Mercado Pago — ESTRUTURA pronta p/ baixa automática.
// Passos p/ ativar: criar preferência com `external_reference = transactionId`,
// cadastrar esta URL no painel do MP e definir MP_WEBHOOK_SECRET.
export async function POST(req: Request) {
  try {
    const secret = process.env.MP_WEBHOOK_SECRET;
    const sig = req.headers.get("x-signature") || "";
    if (secret && sig !== secret) {
      return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
    }
    const body = await req.json();
    // Formato esperado: { transactionId, gatewayRef, status: "approved" }
    const { transactionId, gatewayRef, status } = body;
    if (!transactionId || status !== "approved") {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const row = (
      await db().select().from(transactions).where(eq(transactions.id, transactionId)).limit(1)
    )[0];
    if (!row) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });
    await db()
      .update(transactions)
      .set({ status: "pago", gatewayRef: gatewayRef || row.gatewayRef })
      .where(eq(transactions.id, transactionId));
    if (row.projectId) {
      await notifyProject(row.projectId, "pagamento", `Pagamento confirmado: *${row.descricao}* ✅`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
