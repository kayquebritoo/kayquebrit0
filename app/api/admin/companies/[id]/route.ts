import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, companyBody, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { updateCompany } from "@/lib/kbos/companies";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/companies/:id — nome, grupo, contato, pasta do Lume, brandbook.
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, companyBody.partial());
    if ("error" in parsed) return parsed.error;
    return NextResponse.json({ item: await updateCompany(id, parsed.data) });
  } catch (e) {
    return serverError(e);
  }
}
