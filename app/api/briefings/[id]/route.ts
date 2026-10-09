import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { briefings } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { getCategory } from "@/lib/kbos/briefing-forms";
import { briefingStatusSchema, checkId, readBody } from "@/lib/kbos/validators";

// GET por id: público via uuid (link retornado após o envio).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const row = (await db().select().from(briefings).where(eq(briefings.id, id)).limit(1))[0];
    if (!row) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    const cat = getCategory(row.categoria);
    return NextResponse.json({ ...row, categoriaLabel: cat?.label ?? row.categoria, fields: cat?.fields ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH status: equipe/admin.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const d = deny(user, "admin", "designer", "editor", "fotografo", "programador");
  if (d) return d;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, briefingStatusSchema);
    if ("error" in parsed) return parsed.error;
    const { status } = parsed.data;
    await db().update(briefings).set({ status, updatedAt: new Date() }).where(eq(briefings.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

