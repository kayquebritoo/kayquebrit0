import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { briefings } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { getCategory } from "@/lib/kbos/briefing-forms";

// POST público: cria briefing a partir do form dinâmico.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cat = getCategory(String(body.categoria || ""));
    if (!cat) return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
    const respostas: Record<string, string> = body.respostas || {};
    for (const f of cat.fields) {
      if (f.required && !String(respostas[f.name] || "").trim()) {
        return NextResponse.json({ error: `Campo obrigatório: ${f.label}` }, { status: 400 });
      }
    }
    const nome = String(respostas.nome || "").trim();
    const email = String(respostas.email || "").trim().toLowerCase();
    if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Nome e e-mail válidos são obrigatórios." }, { status: 400 });
    }
    const rows = await db()
      .insert(briefings)
      .values({
        categoria: cat.id,
        clienteNome: nome,
        clienteEmail: email,
        clienteTel: String(respostas.telefone || ""),
        respostas,
        // valor_estimado fica nulo na criação (faixa "2.000 – 5.000" é texto,
        // não número); o valor fechado entra na proposta/projeto.
      })
      .returning({ id: briefings.id });
    return NextResponse.json({ ok: true, id: rows[0].id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: msg.includes("DATABASE_URL") ? 503 : 500 });
  }
}

// GET: lista briefings (equipe/admin).
export async function GET() {
  const user = await sessionUser();
  const d = deny(user, "admin", "designer", "editor", "fotografo", "programador");
  if (d) return d;
  try {
    const rows = await db().select().from(briefings).orderBy(desc(briefings.createdAt)).limit(100);
    return NextResponse.json({ items: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
