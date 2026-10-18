import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { publishCase, unpublishCase } from "@/lib/kbos/showcase";

// POST /api/admin/cases/:id/publish { publish: boolean } — a trava de autorização é aplicada aqui, no servidor.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const body = await readBody(req, z.object({ publish: z.boolean() }));
  if ("error" in body) return body.error;
  try {
    if (body.data.publish) await publishCase(id);
    else await unpublishCase(id);
    revalidatePath("/trabalho", "layout");
    revalidatePath("/briefing", "layout");
    revalidatePath("/sitemap.xml");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
