import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { campaignLogs, campaigns } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, campaignPatchSchema, readBody } from "@/lib/kbos/validators";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;
const EDITABLE = ["draft", "scheduled"] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const row = (await db().select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
  if (!row) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  return NextResponse.json({ item: row });
}

// PATCH — edita rascunho/agendada (disparo em curso é imutável).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, campaignPatchSchema);
    if ("error" in parsed) return parsed.error;
    const camp = (await db().select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
    if (!camp) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    if (!(EDITABLE as readonly string[]).includes(camp.status)) {
      return NextResponse.json({ error: "Campanha em curso ou concluída não pode ser editada." }, { status: 409 });
    }
    const b = parsed.data;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (b.title !== undefined) patch.title = b.title;
    if (b.messageTemplate !== undefined) patch.messageTemplate = b.messageTemplate;
    if (b.targetStatus !== undefined) patch.targetStatus = b.targetStatus;
    if (b.scheduledAt !== undefined) patch.scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;
    await db().update(campaigns).set(patch).where(eq(campaigns.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// DELETE — remove (cascata nos logs). Em curso (`running`): 409.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const camp = (await db().select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
  if (!camp) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (camp.status === "running") {
    return NextResponse.json({ error: "Campanha em disparo não pode ser excluída." }, { status: 409 });
  }
  // Ordem explícita (a FK tem cascade, mas o Neon HTTP não garante ordem em batch).
  await db().delete(campaignLogs).where(eq(campaignLogs.campaignId, id));
  await db().delete(campaigns).where(eq(campaigns.id, id));
  return NextResponse.json({ ok: true });
}
