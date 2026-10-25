import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { MEMBER_ACCESS, addProjectMember, listProjectMembers, removeProjectMember, setMemberAccess, suggestProjectMembers } from "@/lib/kbos/project-members";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Acesso compartilhado ao projeto no portal (além do cliente titular). Só admin.
export async function GET(_req: Request, { params }: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const [items, suggestions] = await Promise.all([listProjectMembers(id), suggestProjectMembers(id)]);
    return NextResponse.json({ items, suggestions });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const parsed = await readBody(req, z.object({ email: z.string().trim().max(160), access: z.enum(MEMBER_ACCESS).optional() }));
    if ("error" in parsed) return parsed.error;
    const r = await addProjectMember(id, parsed.data.email, parsed.data.access);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  } catch (e) {
    return serverError(e);
  }
}

// PATCH { userId, access } — muda o nível: "acompanhar" (vê e aprova) ou "gestao" (planeja e roteiriza o conteúdo).
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const parsed = await readBody(req, z.object({ userId: z.string().uuid(), access: z.enum(MEMBER_ACCESS) }));
    if ("error" in parsed) return parsed.error;
    const ok = await setMemberAccess(id, parsed.data.userId, parsed.data.access);
    if (!ok) return NextResponse.json({ error: "Essa pessoa não tem acesso a este projeto." }, { status: 404 });
    return NextResponse.json({ ok });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const userId = new URL(req.url).searchParams.get("userId") || "";
  const bad = checkId(id) || checkId(userId);
  if (bad) return bad;
  try {
    return NextResponse.json({ ok: await removeProjectMember(id, userId) });
  } catch (e) {
    return serverError(e);
  }
}
