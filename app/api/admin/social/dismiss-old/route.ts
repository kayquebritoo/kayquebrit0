import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { dismissOld } from "@/lib/kbos/social-posts";

export const dynamic = "force-dynamic";

// POST /api/admin/social/dismiss-old { projectId, olderThanDays } — tira da fila o que passou e nunca foi postado (reversível).
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, z.object({ projectId: z.string().uuid(), olderThanDays: z.number().int().min(1).max(365) }));
    if ("error" in parsed) return parsed.error;
    return NextResponse.json(await dismissOld(parsed.data.projectId, parsed.data.olderThanDays));
  } catch (e) {
    return serverError(e);
  }
}
