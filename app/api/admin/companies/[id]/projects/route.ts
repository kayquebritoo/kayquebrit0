import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { setProjectCompany } from "@/lib/kbos/companies";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/companies/:id/projects { projectId } — liga o projeto à empresa.
export async function POST(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, z.object({ projectId: z.string().uuid() }));
    if ("error" in parsed) return parsed.error;
    await setProjectCompany(parsed.data.projectId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

// DELETE /api/admin/companies/:id/projects?projectId= — desliga o projeto da empresa.
export async function DELETE(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const projectId = new URL(req.url).searchParams.get("projectId") || "";
    if (!UUID.test(id) || !UUID.test(projectId)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    await setProjectCompany(projectId, null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
