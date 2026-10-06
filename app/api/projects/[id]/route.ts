import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { projects } from "@/lib/kbos/schema";
import { deny, sessionUser, PIPELINE } from "@/lib/kbos/rbac";
import { notifyProject } from "@/lib/kbos/whatsapp";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;
const STATUS = PIPELINE.map((p) => p.id);

async function visible(id: string, userId: string, role: string) {
  const row = (await db().select().from(projects).where(eq(projects.id, id)).limit(1))[0];
  if (!row) return null;
  if (role !== "cliente" || row.clienteId === userId) return row;
  return "forbidden" as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const row = await visible(id, user.id, user.role);
  if (!row) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (row === "forbidden") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  return NextResponse.json({ item: row });
}

// PATCH: equipe move status / edita. Mudança de status notifica o cliente no WhatsApp.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await req.json();
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    let statusChanged: string | null = null;
    if (body.status !== undefined) {
      if (!STATUS.includes(body.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
      const before = (await db().select().from(projects).where(eq(projects.id, id)).limit(1))[0];
      patch.status = body.status;
      if (before && before.status !== body.status) statusChanged = body.status;
    }
    if (body.titulo !== undefined) patch.titulo = String(body.titulo);
    if (body.valor !== undefined) patch.valor = body.valor ? String(body.valor) : null;
    if (body.prazo !== undefined) patch.prazo = body.prazo ? new Date(body.prazo) : null;
    await db().update(projects).set(patch).where(eq(projects.id, id));
    if (statusChanged) {
      const label = PIPELINE.find((p) => p.id === statusChanged)?.label ?? statusChanged;
      await notifyProject(id, "status", `Status atualizado para *${label}*. Acompanhe no portal.`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

