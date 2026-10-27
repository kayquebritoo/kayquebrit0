import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { COMPANY_ROLES, grantCompanyAccess, revokeCompanyAccess } from "@/lib/kbos/companies";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/companies/:id/access { email, role } — dá, reativa ou troca o papel do acesso.
export async function POST(req: Request, ctx: Ctx) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, z.object({ email: z.email().max(160), role: z.enum(COMPANY_ROLES) }));
    if ("error" in parsed) return parsed.error;
    return NextResponse.json({ item: await grantCompanyAccess(id, parsed.data.email, parsed.data.role, user?.id ?? null) });
  } catch (e) {
    return serverError(e);
  }
}

// DELETE /api/admin/companies/:id/access?userId= — revoga (fica no histórico).
export async function DELETE(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const userId = new URL(req.url).searchParams.get("userId") || "";
    if (!UUID.test(id) || !UUID.test(userId)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    const ok = await revokeCompanyAccess(id, userId);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Acesso não encontrado." }, { status: 404 });
  } catch (e) {
    return serverError(e);
  }
}
