import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { PostError, updatePost } from "@/lib/kbos/social-posts";
import { syncPublications } from "@/lib/kbos/content-cycle";
import { notifyApprovalNeeded } from "@/lib/kbos/social-notify";
import { POST_FORMATS, POST_STATUS } from "@/lib/kbos/social-import";

export const dynamic = "force-dynamic";
const patch = z.object({
  title: z.string().min(1).max(200).optional(),
  brand: z.string().max(60).nullable().optional(),
  collabBrands: z.array(z.string().min(1).max(60)).max(2).optional(),
  format: z.enum(POST_FORMATS).optional(),
  networks: z.array(z.string().max(30)).max(10).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(POST_STATUS).optional(),
  script: z.string().max(30000).nullable().optional(),
  caption: z.string().max(5000).nullable().optional(),
  mediaUrl: z.string().max(1000).nullable().optional(),
  postedUrl: z.string().max(1000).nullable().optional(),
  scriptBy: z.string().max(80).nullable().optional(),
  captureBy: z.string().max(80).nullable().optional(),
  editor: z.string().max(80).nullable().optional(),
  errorMessage: z.string().max(500).nullable().optional(),
  dismissed: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/social/:id — edita o post. Status "aprovacao" avisa o cliente por WhatsApp.
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
    const parsed = await readBody(req, patch);
    if ("error" in parsed) return parsed.error;
    const { scheduledAt, ...rest } = parsed.data;
    const r = await updatePost(id, { ...rest, ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}) });
    if (rest.networks !== undefined) await syncPublications(id, rest.networks);
    if (r.sentToApproval) await notifyApprovalNeeded(r.post);
    return NextResponse.json({ item: r.post });
  } catch (e) {
    if (e instanceof PostError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
