import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { PostError, movePosts } from "@/lib/kbos/social-posts";

export const dynamic = "force-dynamic";

// POST /api/admin/social/move { fromProjectId, toProjectId } — passa todos os posts de um projeto para outro.
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, z.object({ fromProjectId: z.string().uuid(), toProjectId: z.string().uuid() }));
    if ("error" in parsed) return parsed.error;
    return NextResponse.json(await movePosts(parsed.data.fromProjectId, parsed.data.toProjectId));
  } catch (e) {
    if (e instanceof PostError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
