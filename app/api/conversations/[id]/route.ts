import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts, conversations } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, conversationPatchSchema, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const conv = (await db().select().from(conversations).where(eq(conversations.id, id)).limit(1))[0];
  if (!conv) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const contact = conv.contactId
    ? (await db().select().from(contacts).where(eq(contacts.id, conv.contactId)).limit(1))[0] ?? null
    : null;
  return NextResponse.json({ item: conv, contact });
}

// PATCH /api/conversations/[id] — status, vínculo CRM ou `markRead`.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, conversationPatchSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (b.contactId !== undefined) patch.contactId = b.contactId;
    if (b.status !== undefined) patch.status = b.status;
    if (b.markRead) patch.unreadCount = 0;
    await db().update(conversations).set(patch).where(eq(conversations.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
