import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { CONTACT_EXTRA_KEYS, checkId, contactPatchSchema, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const row = (await db().select().from(contacts).where(eq(contacts.id, id)).limit(1))[0];
  if (!row) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  return NextResponse.json({ item: row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, contactPatchSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (b.name !== undefined) patch.name = b.name;
    if (b.email !== undefined) patch.email = b.email ? b.email.toLowerCase() : null;
    if (b.phone !== undefined) patch.phone = b.phone || null;
    if (b.company !== undefined) patch.company = b.company || null;
    if (b.status !== undefined) patch.status = b.status;
    if (b.notes !== undefined) patch.notes = b.notes || null;
    for (const k of CONTACT_EXTRA_KEYS) {
      if (b[k] !== undefined) patch[k] = b[k] || null;
    }
    if (b.kind !== undefined) patch.kind = b.kind;
    await db().update(contacts).set(patch).where(eq(contacts.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  await db().update(contacts).set({ status: "archived", updatedAt: new Date() }).where(eq(contacts.id, id));
  return NextResponse.json({ ok: true });
}
