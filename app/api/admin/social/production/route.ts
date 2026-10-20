import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { applyProduction } from "@/lib/kbos/social-production";

export const dynamic = "force-dynamic";

// POST /api/admin/social/production { projectId, month, text, dryRun? } — aplica a lista de produção colada (etapas por post).
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, z.object({ projectId: z.string().uuid(), month: z.string().regex(/^\d{4}-\d{2}$/), text: z.string().min(5).max(20000), dryRun: z.boolean().optional() }));
    if ("error" in parsed) return parsed.error;
    return NextResponse.json(await applyProduction(parsed.data.projectId, parsed.data.month, parsed.data.text, !!parsed.data.dryRun));
  } catch (e) {
    return serverError(e);
  }
}
