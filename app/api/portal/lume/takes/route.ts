import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { lumeReady, projectLumePasta, searchTakes } from "@/lib/kbos/lume-takes";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/portal/lume/takes?projectId=&q=&sub=Hotel&tipo=video|foto — takes do acervo da empresa do projeto (cliente ou equipe).
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "cliente", "admin");
  if (denied || !user) return denied!;
  const sp = new URL(req.url).searchParams;
  const projectId = sp.get("projectId") || "";
  if (!UUID.test(projectId)) return NextResponse.json({ error: "Projeto inválido." }, { status: 400 });
  try {
    const pasta = await projectLumePasta(projectId, user);
    if (!pasta || !lumeReady()) return NextResponse.json({ error: "O acervo do Lume ainda não está ligado a este projeto." }, { status: 404 });
    const items = await searchTakes(pasta, sp.get("q") || "", { sub: sp.get("sub"), tipo: sp.get("tipo") });
    return NextResponse.json({ items: items.map((t) => ({ ...t, thumb: `/api/portal/lume/thumb/${t.id}/?projectId=${projectId}` })) });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("O Lume")) return NextResponse.json({ error: e.message }, { status: 502 });
    return serverError(e);
  }
}
