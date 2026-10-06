import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { projectFiles, projects } from "@/lib/kbos/schema";
import { sessionUser } from "@/lib/kbos/rbac";
import { notifyProject } from "@/lib/kbos/whatsapp";

// PATCH: cliente aprova/reprova (só arquivos dos próprios projetos); equipe também pode.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const { id, fileId } = await params;
    const { status, feedback } = await req.json();
    if (!["aprovado", "reprovado"].includes(status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    const proj = (await db().select().from(projects).where(eq(projects.id, id)).limit(1))[0];
    if (!proj) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    if (user.role === "cliente" && proj.clienteId !== user.id) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    await db()
      .update(projectFiles)
      .set({ status })
      .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, id)));
    await notifyProject(
      id,
      "aprovacao",
      status === "aprovado"
        ? `Arquivo aprovado pelo cliente. ✅`
        : `Arquivo reprovado pelo cliente. ❌${feedback ? `\nFeedback: ${feedback}` : ""}`
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// Export estático (Hostinger): sem paths pré-gerados; na Vercel resolve em runtime.
export async function generateStaticParams() {
  return [];
}
