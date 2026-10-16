import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { deals } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, dealPatchSchema, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const row = (await db().select().from(deals).where(eq(deals.id, id)).limit(1))[0];
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
    const parsed = await readBody(req, dealPatchSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (b.title !== undefined) patch.title = b.title;
    if (b.contactId !== undefined) patch.contactId = b.contactId;
    if (b.stage !== undefined) patch.stage = b.stage;
    if (b.value !== undefined) patch.value = b.value;
    if (b.position !== undefined) patch.position = b.position;
    await db().update(deals).set(patch).where(eq(deals.id, id));
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
  await db().delete(deals).where(eq(deals.id, id));
  return NextResponse.json({ ok: true });
}
