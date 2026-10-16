import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { courses } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, coursePatchSchema, readBody } from "@/lib/kbos/validators";
import { isConflict } from "@/lib/kbos/lms";
import { serverError } from "@/lib/kbos/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const row = (await db().select().from(courses).where(eq(courses.id, id)).limit(1))[0];
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
    const parsed = await readBody(req, coursePatchSchema);
    if ("error" in parsed) return parsed.error;
    try {
      await db().update(courses).set({ ...parsed.data, updatedAt: new Date() }).where(eq(courses.id, id));
      return NextResponse.json({ ok: true });
    } catch (e) {
      if (isConflict(e)) return NextResponse.json({ error: "Slug já em uso." }, { status: 409 });
      throw e;
    }
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
  await db().delete(courses).where(eq(courses.id, id));
  return NextResponse.json({ ok: true });
}
