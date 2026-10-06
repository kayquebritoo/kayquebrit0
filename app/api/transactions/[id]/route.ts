import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { transactions } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const { id } = await params;
    const b = await req.json();
    const patch: Record<string, unknown> = {};
    if (b.status !== undefined) {
      if (!["pendente", "pago", "vencido"].includes(b.status)) {
        return NextResponse.json({ error: "Status inválido." }, { status: 400 });
      }
      patch.status = b.status;
    }
    if (b.gatewayRef !== undefined) patch.gatewayRef = b.gatewayRef;
    await db().update(transactions).set(patch).where(eq(transactions.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

