import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { transactions } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody, transactionPatchSchema } from "@/lib/kbos/validators";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, transactionPatchSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const patch: Record<string, unknown> = {};
    if (b.status !== undefined) patch.status = b.status;
    if (b.gatewayRef !== undefined) patch.gatewayRef = b.gatewayRef;
    await db().update(transactions).set(patch).where(eq(transactions.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

