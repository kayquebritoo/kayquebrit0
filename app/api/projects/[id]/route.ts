import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { projects } from "@/lib/kbos/schema";
import { deny, sessionUser, PIPELINE } from "@/lib/kbos/rbac";
import { notifyProject } from "@/lib/kbos/whatsapp";
import { checkId, projectPatchSchema, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

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
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, projectPatchSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    let statusChanged: string | null = null;
    if (body.status !== undefined) {
      const before = (await db().select().from(projects).where(eq(projects.id, id)).limit(1))[0];
      patch.status = body.status;
      if (before && before.status !== body.status) statusChanged = body.status;
    }
    if (body.titulo !== undefined) patch.titulo = body.titulo;
    if (body.categoria !== undefined) patch.categoria = body.categoria;
    if (body.contactId !== undefined) patch.contactId = body.contactId || null;
    if (body.valor !== undefined) patch.valor = body.valor;
    if (body.postLimit !== undefined) patch.postLimit = body.postLimit;
    if (body.prazo !== undefined) patch.prazo = body.prazo ? new Date(body.prazo) : null;
    // Fase 1 — vitrine / associação com curso.
    if (body.slug !== undefined) patch.slug = body.slug || null;
    if (body.description !== undefined) patch.description = body.description || null;
    if (body.coverUrl !== undefined) patch.coverUrl = body.coverUrl || null;
    if (body.thumbUrl !== undefined) patch.thumbUrl = body.thumbUrl || null;
    if (body.videoUrl !== undefined) patch.videoUrl = body.videoUrl || null;
    if (body.courseId !== undefined) patch.courseId = body.courseId || null;
    await db().update(projects).set(patch).where(eq(projects.id, id));
    if (statusChanged) {
      const label = PIPELINE.find((p) => p.id === statusChanged)?.label ?? statusChanged;
      await notifyProject(id, "status", `Status atualizado para *${label}*. Acompanhe no portal.`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (/slug|unique|duplicate/i.test(e instanceof Error ? e.message : "")) {
      return NextResponse.json({ error: "Slug já em uso." }, { status: 409 });
    }
    return serverError(e);
  }
}


// DELETE: remove o projeto (admin). Tarefas e arquivos saem junto; se houver venda/plano ligado, o banco recusa.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    await db().delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (/foreign key|violates|restrict/i.test(e instanceof Error ? e.message : "")) {
      return NextResponse.json({ error: "Este projeto tem venda ou plano ligados. Desfaça o aceite antes de apagar." }, { status: 409 });
    }
    return serverError(e);
  }
}
