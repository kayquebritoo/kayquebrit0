import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts, projects } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { hubFor } from "@/lib/kbos/client-hubs";
import { LUME_ONLINE_DEFAULT, lumeClientEntryUrl } from "@/lib/kbos/lume";
import { clientProjects } from "@/lib/kbos/project-members";

export const dynamic = "force-dynamic";

// GET /api/portal/lume[?check=1] — cliente logado abre o Lume SÓ na pasta da empresa dele (somente leitura).
// O hub vem dos contatos ligados aos projetos dele (cadastrados pelo admin), nunca do nome que o próprio usuário digita.
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "cliente", "admin");
  if (denied) return denied;
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const secret = (process.env.LUME_API_TOKEN || "").trim();
  const check = new URL(req.url).searchParams.get("check") === "1";
  let hub = null;
  try {
    const rows = await db()
      .select({ name: contacts.name, company: contacts.company })
      .from(projects)
      .innerJoin(contacts, eq(projects.contactId, contacts.id))
      .where(clientProjects(user.id))
      .limit(50);
    for (const r of rows) { hub = hubFor(r.name, r.company); if (hub) break; }
  } catch { /* sem banco: sem acesso */ }
  if (!hub || !secret) {
    return check ? NextResponse.json({ available: false }) : NextResponse.json({ error: "O acervo de arquivos ainda não foi liberado para você." }, { status: 404 });
  }
  if (check) return NextResponse.json({ available: true, label: hub.label });
  const base = (process.env.LUME_URL || LUME_ONLINE_DEFAULT).trim();
  return NextResponse.redirect(lumeClientEntryUrl(base, secret, hub.pasta));
}
