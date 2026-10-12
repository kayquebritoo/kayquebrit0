import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { events } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, eventPatchSchema, readBody } from "@/lib/kbos/validators";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const row = (await db().select().from(events).where(eq(events.id, id)).limit(1))[0];
  if (!row) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  return NextResponse.json({ item: row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, eventPatchSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (b.title !== undefined) patch.title = b.title;
    if (b.description !== undefined) patch.description = b.description || null;
    if (b.startTime !== undefined) patch.startTime = new Date(b.startTime);
    if (b.endTime !== undefined) patch.endTime = b.endTime ? new Date(b.endTime) : null;
    if (b.location !== undefined) patch.location = b.location || null;
    if (b.reminderMinutesBefore !== undefined) patch.reminderMinutesBefore = b.reminderMinutesBefore;
    // Reagendar ou trocar a antecedência rearma o alerta (sem duplicar:
    // o worker só envia com `notification_sent = false`).
    if (b.startTime !== undefined || b.reminderMinutesBefore !== undefined || b.markUnsent) {
      patch.notificationSent = false;
      patch.reminderSentAt = null;
    }
    await db().update(events).set(patch).where(eq(events.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  await db().delete(events).where(eq(events.id, id));
  return NextResponse.json({ ok: true });
}
