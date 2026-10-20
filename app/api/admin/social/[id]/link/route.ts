import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { PostError, linkScript, suggestScripts } from "@/lib/kbos/social-posts";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/social/:id/link — roteiros que provavelmente originaram este post.
export async function GET(_req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
    return NextResponse.json({ items: await suggestScripts(id) });
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/admin/social/:id/link { scriptId } — liga o roteiro a este post.
export async function POST(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
    const parsed = await readBody(req, z.object({ scriptId: z.string().uuid() }));
    if ("error" in parsed) return parsed.error;
    return NextResponse.json({ item: await linkScript(parsed.data.scriptId, id) });
  } catch (e) {
    if (e instanceof PostError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
