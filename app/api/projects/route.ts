import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { projects, users } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";

// GET: equipe vê tudo; cliente vê só os próprios.
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const d = db();
    const rows =
      user.role === "cliente"
        ? await d.select().from(projects).where(eq(projects.clienteId, user.id)).orderBy(desc(projects.updatedAt))
        : await d.select().from(projects).orderBy(desc(projects.updatedAt)).limit(200);
    return NextResponse.json({ items: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// POST: cria projeto (admin). Pode vincular briefing + cliente por e-mail.
export async function POST(req: Request) {
  const user = await sessionUser();
  const d = deny(user, "admin");
  if (d) return d;
  try {
    const body = await req.json();
    if (!body.titulo || !body.categoria) {
      return NextResponse.json({ error: "Título e categoria são obrigatórios." }, { status: 400 });
    }
    let clienteId: string | null = body.clienteId || null;
    if (!clienteId && body.clienteEmail) {
      const cli = (
        await db().select().from(users).where(eq(users.email, String(body.clienteEmail).toLowerCase())).limit(1)
      )[0];
      clienteId = cli?.id ?? null;
    }
    const rows = await db()
      .insert(projects)
      .values({
        titulo: String(body.titulo),
        categoria: String(body.categoria),
        clienteId,
        briefingId: body.briefingId || null,
        valor: body.valor ? String(body.valor) : null,
        prazo: body.prazo ? new Date(body.prazo) : null,
      })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
