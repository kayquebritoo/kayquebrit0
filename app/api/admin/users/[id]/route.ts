import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { setUserDisabled } from "@/lib/kbos/companies";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/users/:id { disabled } — desativar derruba todas as sessões na hora; reativar libera o login.
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const bad = checkId(id);
    if (bad) return bad;
    const parsed = await readBody(req, z.object({ disabled: z.boolean() }));
    if ("error" in parsed) return parsed.error;
    return NextResponse.json(await setUserDisabled(id, parsed.data.disabled));
  } catch (e) {
    return serverError(e);
  }
}
