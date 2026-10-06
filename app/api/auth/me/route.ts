import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/kbos/rbac";

// GET: sessão atual (usado pelos guards client-side das páginas KBOS).
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
