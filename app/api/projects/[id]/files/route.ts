import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { projectFiles, projects } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { notifyProject } from "@/lib/kbos/whatsapp";

// GET arquivos do projeto (dono ou equipe).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const proj = (await db().select().from(projects).where(eq(projects.id, id)).limit(1))[0];
  if (!proj) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (user.role === "cliente" && proj.clienteId !== user.id) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const files = await db()
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.projectId, id))
    .orderBy(desc(projectFiles.createdAt));
  return NextResponse.json({ items: files });
}

// POST: equipe envia arquivo (entrega/aprovação) -> notifica o cliente.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, "admin", "designer", "editor", "fotografo", "programador");
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await req.json();
    if (!body.nome || !body.url) {
      return NextResponse.json({ error: "Nome e URL são obrigatórios." }, { status: 400 });
    }
    const rows = await db()
      .insert(projectFiles)
      .values({ projectId: id, nome: String(body.nome), url: String(body.url), kind: body.kind === "entrega" ? "entrega" : "aprovacao" })
      .returning();
    await notifyProject(id, "arquivo", `Novo arquivo para aprovação: *${body.nome}*\nAbra o portal para revisar.`);
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// Export estático (Hostinger): sem paths pré-gerados; na Vercel resolve em runtime.
export async function generateStaticParams() {
  return [];
}
